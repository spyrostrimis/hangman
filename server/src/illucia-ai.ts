// Experimental AI mode (v2 Track D2). In an experimental round, Illucia may ask a Workers AI
// model to invent a yes/no meaning question over her candidates and sort them. The model,
// prompt and validation are the ones the offline test (D1) measured: tools/ILLUCIA-AI-QUESTIONS.md.
// The model sees the candidate list only, never the player's word. Code validates every
// reply; any failure, timeout or exhausted budget tells the page to make her normal move.
import { ILLUCIA_MAX_QUESTIONS } from '../../shared/scoring-protocol.js';
import {
  MAX_YES_SHARE, MIN_YES_SHARE, normalizeQuestionResult, questionInput, questionVocabularyProblems, validateReply,
} from '../../shared/illucia-question.js';
import { clefInputs, clefProbabilities, clefReserveTokens, clefSort, clefUsage } from '../../shared/illucia-clef.js';
import { illuciaWordSize } from './illucia-words';

type Rates = { input: number; output: number };
type Sorter = { id: string; label: string; rates: Rates; timeoutMs: number };
type AiModel = { id: string; label: string; rates: Rates; maxTokens: number; timeoutMs: number; options: object; sorter?: Sorter };

// Clef-flash, Cloudflare's decision model: it cannot write a question, but sorts candidates
// under one (D1: 91% agreement with WordNet, every sort within 1.2 s). It bills input only,
// about 90-99 tokens per candidate.
const CLEF_FLASH: Sorter = Object.freeze({ id: '@cf/cloudflare/clef-flash', label: 'Clef-flash',
  rates: Object.freeze({ input: 21818, output: 0 }), timeoutMs: 4000 });

// The models the route may use, chosen by the AI_MODEL var. Rates are neurons per million
// tokens, checked against Cloudflare's pricing page on 2026-10-02. `label` names the model
// to the player on every AI question. With a `sorter`, the first model only writes the
// question, and the sorter's lists replace its own.
export const AI_MODELS: Readonly<Record<string, AiModel>> = Object.freeze({
  // The D1 pick. Its longest D1 reply used 310 tokens (80 candidates need about 400), and
  // every reply arrived within 4.8 s (p95 4.4 s).
  'llama-3.3-70b': Object.freeze({ id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', label: 'Llama 3.3 70B',
    rates: Object.freeze({ input: 26668, output: 204805 }), maxTokens: 768, timeoutMs: 6000, options: Object.freeze({}) }),
  // Owner's live trial (2026-10-03), not measured offline at this effort. At "low", D1 saw
  // 2–25 s and up to ~1,500 output tokens; medium reasons longer, hence the ceiling and timeout.
  'gpt-oss-120b-medium': Object.freeze({ id: '@cf/openai/gpt-oss-120b', label: 'gpt-oss-120b',
    rates: Object.freeze({ input: 31818, output: 68182 }), maxTokens: 4096, timeoutMs: 40000,
    options: Object.freeze({ reasoning_effort: 'medium' }) }),
  // The same model at its lowest effort (it has no "off"). D1 at low: 2–25 s, up to ~1,500
  // output tokens; owner's choice for production from 2026-10-04.
  'gpt-oss-120b-low': Object.freeze({ id: '@cf/openai/gpt-oss-120b', label: 'gpt-oss-120b',
    rates: Object.freeze({ input: 31818, output: 68182 }), maxTokens: 4096, timeoutMs: 40000,
    options: Object.freeze({ reasoning_effort: 'low' }) }),
  // Owner's choice for production from 2026-10-04: Llama writes, Clef-flash sorts.
  'llama-3.3-70b-clef-flash': Object.freeze({ id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', label: 'Llama 3.3 70B',
    rates: Object.freeze({ input: 26668, output: 204805 }), maxTokens: 768, timeoutMs: 6000, options: Object.freeze({}),
    sorter: CLEF_FLASH }),
});
export type AiModelKey = string;
export const DEFAULT_AI_MODEL: AiModelKey = 'llama-3.3-70b';
export const AI_MAX_CANDIDATES = 80;
const DEFAULT_LIMITS = Object.freeze({ dailyNeurons: 2000, dailyRequests: 60, userDaily: 30 });

export type AiLimits = { enabled: boolean; model: AiModelKey; dailyNeurons: number; dailyRequests: number; userDaily: number };
type AiRunner = { run(model: string, input: object): Promise<unknown> };
type AiEnv = Pick<Env, 'DB'> & {
  AI?: unknown; AI_MODEL?: string; AI_ENABLED?: string; AI_DAILY_NEURONS?: string; AI_DAILY_REQUESTS?: string; AI_USER_DAILY_QUESTIONS?: string;
};

// Configuration comes from Worker vars; a malformed value switches the mode off rather
// than raising a limit.
export function aiLimits(env: AiEnv): AiLimits {
  const number = (value: string | undefined, fallback: number) => {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : -1;
  };
  const limits = {
    dailyNeurons: number(env.AI_DAILY_NEURONS, DEFAULT_LIMITS.dailyNeurons),
    dailyRequests: number(env.AI_DAILY_REQUESTS, DEFAULT_LIMITS.dailyRequests),
    userDaily: number(env.AI_USER_DAILY_QUESTIONS, DEFAULT_LIMITS.userDaily),
  };
  const model = (env.AI_MODEL ?? DEFAULT_AI_MODEL) as AiModelKey;
  const valid = Object.values(limits).every(value => value >= 0) && Object.hasOwn(AI_MODELS, model);
  return { enabled: env.AI_ENABLED === 'true' && valid && typeof (env.AI as AiRunner | undefined)?.run === 'function', model, ...limits };
}

export const neuronsFor = (rates: Rates, promptTokens: number, completionTokens: number) =>
  (promptTokens * rates.input + completionTokens * rates.output) / 1e6;

// The binding may return text, a chat `choices` envelope, or JSON it already parsed into
// `response` (seen in I7a); a parsed object is re-serialized and validated like text.
export function readReply(raw: unknown) {
  const value = raw as { response?: unknown; choices?: unknown } | null;
  const shaped = value && typeof value.response === 'object' && value.response !== null && !Array.isArray(value.choices)
    ? { ...value, response: JSON.stringify(value.response) } : value;
  try { return normalizeQuestionResult(shaped); } catch { return null; }
}

// Candidates: 2–80 distinct accepted words of the round's length, sorted.
export function areCandidates(value: unknown, length: number): value is string[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > AI_MAX_CANDIDATES) return false;
  return value.every((word, index) => typeof word === 'string' && word.length === length
    && (index === 0 || value[index - 1] < word) && illuciaWordSize(word) !== null);
}

export const dayOf = (now: number) => new Date(now).toISOString().slice(0, 10);

export type AskOutcome =
  | { status: 409; error: string }
  | { ok: false; reason: 'disabled' | 'round-limit' | 'user-limit' | 'budget' | 'timeout' | 'unavailable' | 'invalid'; questionsLeft: number }
  | { ok: true; question: string; yes: string[]; no: string[]; questionsLeft: number; model: string };
type RoundRow = { length: number; experimental: number; claimed_at: number | null; expires_at: number; ai_questions: number };
type Options = { now?: number; timeoutMs?: number; defer?: (work: Promise<unknown>) => void };

export async function readAiRound(db: D1Database, userId: string, roundId: string, now: number) {
  const round = await db.prepare(`SELECT length(word) AS length, experimental, claimed_at, expires_at, ai_questions
    FROM illucia_rounds WHERE id = ? AND user_id = ?`).bind(roundId, userId).first<RoundRow>();
  if (!round || round.claimed_at !== null || round.expires_at <= now) return null;
  return round;
}

// Candidates must already have passed areCandidates for this round's length.
export async function askIllucia(env: AiEnv, userId: string, roundId: string, candidates: string[], round: RoundRow,
  { now = Date.now(), timeoutMs, defer = () => {} }: Options = {}): Promise<AskOutcome> {
  if (round.experimental !== 1) return { status: 409, error: 'AI questions are only for experimental rounds.' };
  const left = (used: number) => Math.max(0, ILLUCIA_MAX_QUESTIONS - used);
  const limits = aiLimits(env);
  if (!limits.enabled) return { ok: false, reason: 'disabled', questionsLeft: left(round.ai_questions) };
  if (round.ai_questions >= ILLUCIA_MAX_QUESTIONS) return { ok: false, reason: 'round-limit', questionsLeft: 0 };

  const model = AI_MODELS[limits.model];
  const input = questionInput('invent', candidates, { maxTokens: model.maxTokens, options: model.options });
  // Worst cases: every prompt byte a token, plus template overhead, and every allowed output
  // token; for the sorter, its measured per-question template too (clefReserveTokens).
  const inventReservation = neuronsFor(model.rates, new TextEncoder().encode(JSON.stringify(input.messages)).length + 256, model.maxTokens);
  const sortReservation = model.sorter
    ? clefInputs(model.sorter.id, candidates, 'Can your word mean anything?')
      .reduce((sum, part) => sum + neuronsFor(model.sorter!.rates, clefReserveTokens(part), 0), 0) : 0;
  const reservation = inventReservation + sortReservation;
  const day = dayOf(now);
  const token = crypto.randomUUID();
  const granted = 'EXISTS (SELECT 1 FROM illucia_rounds WHERE id = ? AND ai_token = ?)';
  const db = env.DB;
  // One atomic batch: the round, the player's day and the site's day must all have room,
  // and the grant updates all three or none.
  const results = await db.batch([
    db.prepare('INSERT INTO ai_budget (day) VALUES (?) ON CONFLICT(day) DO NOTHING').bind(day),
    db.prepare(`UPDATE illucia_rounds SET ai_questions = ai_questions + 1, ai_token = ?
      WHERE id = ? AND user_id = ? AND experimental = 1 AND claimed_at IS NULL AND expires_at > ? AND ai_questions < ?
      AND COALESCE((SELECT questions FROM illucia_ai_users WHERE user_id = ? AND day = ?), 0) < ?
      AND (SELECT requests FROM ai_budget WHERE day = ?) < ?
      AND (SELECT neurons FROM ai_budget WHERE day = ?) + ? <= ?`)
      .bind(token, roundId, userId, now, ILLUCIA_MAX_QUESTIONS, userId, day, limits.userDaily,
        day, limits.dailyRequests, day, reservation, limits.dailyNeurons),
    db.prepare(`INSERT INTO illucia_ai_users (user_id, day, questions) SELECT ?, ?, 1 WHERE ${granted}
      ON CONFLICT(user_id, day) DO UPDATE SET questions = questions + 1`).bind(userId, day, roundId, token),
    db.prepare(`UPDATE ai_budget SET requests = requests + 1, neurons = neurons + ? WHERE day = ? AND ${granted}`)
      .bind(reservation, day, roundId, token),
    db.prepare(`SELECT ai_questions, ai_token = ? AS granted,
        COALESCE((SELECT questions FROM illucia_ai_users WHERE user_id = ? AND day = ?), 0) AS userQuestions
      FROM illucia_rounds WHERE id = ? AND user_id = ?`).bind(token, userId, day, roundId, userId),
  ]);
  const state = results[4].results[0] as { ai_questions: number; granted: number; userQuestions: number } | undefined;
  if (!state) return { status: 409, error: 'This round is no longer available.' };
  const questionsLeft = left(state.ai_questions);
  if (state.granted !== 1) {
    if (state.ai_questions >= ILLUCIA_MAX_QUESTIONS) return { ok: false, reason: 'round-limit', questionsLeft: 0 };
    if (state.userQuestions >= limits.userDaily) return { ok: false, reason: 'user-limit', questionsLeft };
    return { ok: false, reason: 'budget', questionsLeft };
  }

  // Replace each part of the reservation with measured usage when it arrives, even after a
  // timeout; a part that never ran is released.
  type Usage = { prompt_tokens?: number | null; completion_tokens?: number | null } | null | undefined;
  const settle = async (reserved: number, rates: Rates, usage: Usage) => {
    if (!Number.isInteger(usage?.prompt_tokens) || !Number.isInteger(usage?.completion_tokens)) return;
    await db.prepare('UPDATE ai_budget SET neurons = MAX(0, neurons - ? + ?) WHERE day = ?')
      .bind(reserved, neuronsFor(rates, usage!.prompt_tokens!, usage!.completion_tokens!), day).run();
  };
  const releaseSort = () => (model.sorter ? settle(sortReservation, model.sorter.rates, { prompt_tokens: 0, completion_tokens: 0 }) : null);
  const race = async <T,>(work: Promise<T>, ms: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<'timeout'>(resolve => { timer = setTimeout(() => resolve('timeout'), ms); });
    const result = await Promise.race([work, timedOut]);
    if (timer !== undefined) clearTimeout(timer);
    return result;
  };
  const started = Date.now();
  const log = (outcome: string) => console.log(JSON.stringify({ event: 'illucia_ai', model: limits.model, outcome, ms: Date.now() - started }));
  const fail = (reason: 'timeout' | 'unavailable' | 'invalid', outcome: string = reason) => {
    log(outcome);
    return { ok: false as const, reason, questionsLeft };
  };

  const call = (env.AI as AiRunner).run(model.id, input).then(readReply, () => null);
  const result = await race(call, timeoutMs ?? model.timeoutMs);
  if (result === 'timeout') {
    defer(call.then(late => settle(inventReservation, model.rates, late?.usage ?? null)).catch(() => {}));
    await releaseSort();
    return fail('timeout');
  }
  await settle(inventReservation, model.rates, result?.usage ?? null);
  if (!result) {
    await releaseSort();
    return fail('unavailable');
  }
  const verdict = validateReply(result.response, candidates, { mode: 'invent' });
  const known = (word: string) => illuciaWordSize(word) !== null;
  if (!model.sorter) {
    if (verdict.outcome !== 'accepted' || questionVocabularyProblems(verdict.question, known).length) return fail('invalid');
    log('accepted');
    // An accepted reply always has both lists.
    return { ok: true, question: String(verdict.question).trim(), yes: verdict.yes as string[], no: verdict.no as string[], questionsLeft, model: model.label };
  }

  // With a sorter, only the question must be good: the first model's lists are not used.
  if (['unparseable', 'wrong-shape', 'rejected-question'].includes(verdict.outcome)
    || questionVocabularyProblems(verdict.question, known).length) {
    await releaseSort();
    return fail('invalid', 'invalid-question');
  }
  const question = String(verdict.question).trim();
  const sorter = model.sorter;
  type SortReply = { usage: ReturnType<typeof clefUsage>; probabilities: ReturnType<typeof clefProbabilities> } | null;
  const parts = clefInputs(sorter.id, candidates, question);
  const sorting: Promise<SortReply[]> = Promise.all(parts.map(part => (env.AI as AiRunner).run(sorter.id, part).then(
    raw => ({ usage: clefUsage(raw), probabilities: clefProbabilities(raw, Object.keys(part.questions)) }), () => null)));
  const settleSort = (replies: SortReply[]) => {
    const tokens = replies.map(reply => reply?.usage?.prompt_tokens);
    // A part without usage keeps the whole sort reservation (conservative).
    return tokens.every(value => Number.isInteger(value))
      ? settle(sortReservation, sorter.rates, { prompt_tokens: (tokens as number[]).reduce((a, b) => a + b, 0), completion_tokens: 0 })
      : null;
  };
  const sorted = await race(sorting, sorter.timeoutMs);
  if (sorted === 'timeout') {
    defer(sorting.then(settleSort).catch(() => {}));
    return fail('timeout', 'sort-timeout');
  }
  await settleSort(sorted);
  if (sorted.some(reply => !reply?.probabilities)) return fail('unavailable', 'sort-unavailable');
  const split = clefSort(Object.assign({}, ...sorted.map(reply => reply!.probabilities)), candidates);
  if (split.yesShare < MIN_YES_SHARE || split.yesShare > MAX_YES_SHARE) return fail('invalid', 'sort-uneven');
  log('accepted');
  return { ok: true, question, yes: split.yes, no: split.no, questionsLeft, model: `${model.label} and ${sorter.label}` };
}
