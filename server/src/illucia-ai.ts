// Experimental AI mode (v2 Track D2). In an experimental round, Illucia may ask a Workers AI
// model to invent a yes/no meaning question over her candidates and sort them. The model,
// prompt and validation are the ones the offline test (D1) measured: tools/ILLUCIA-AI-QUESTIONS.md.
// The model sees the candidate list only, never the player's word. Code validates every
// reply; any failure, timeout or exhausted budget tells the page to make her normal move.
import { ILLUCIA_MAX_QUESTIONS } from '../../shared/scoring-protocol.js';
import { normalizeQuestionResult, questionInput, questionVocabularyProblems, validateReply } from '../../shared/illucia-question.js';
import { illuciaWordSize } from './illucia-words';

export const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
// Neurons per million tokens, checked against Cloudflare's pricing page on 2026-10-02.
export const AI_RATES = Object.freeze({ input: 26668, output: 204805 });
// D1's longest Llama 3.3 reply used 310 tokens; 80 candidates need about 400.
export const AI_MAX_TOKENS = 768;
// D1: every Llama 3.3 reply arrived within 4.8 s (p95 4.4 s).
export const AI_TIMEOUT_MS = 6000;
export const AI_MAX_CANDIDATES = 80;
const DEFAULT_LIMITS = Object.freeze({ dailyNeurons: 2000, dailyRequests: 60, userDaily: 30 });

export type AiLimits = { enabled: boolean; dailyNeurons: number; dailyRequests: number; userDaily: number };
type AiRunner = { run(model: string, input: object): Promise<unknown> };
type AiEnv = Pick<Env, 'DB'> & {
  AI?: unknown; AI_ENABLED?: string; AI_DAILY_NEURONS?: string; AI_DAILY_REQUESTS?: string; AI_USER_DAILY_QUESTIONS?: string;
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
  const valid = Object.values(limits).every(value => value >= 0);
  return { enabled: env.AI_ENABLED === 'true' && valid && typeof (env.AI as AiRunner | undefined)?.run === 'function', ...limits };
}

export const neuronsFor = (promptTokens: number, completionTokens: number) =>
  (promptTokens * AI_RATES.input + completionTokens * AI_RATES.output) / 1e6;

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
  | { ok: true; question: string; yes: string[]; no: string[]; questionsLeft: number };
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
  { now = Date.now(), timeoutMs = AI_TIMEOUT_MS, defer = () => {} }: Options = {}): Promise<AskOutcome> {
  if (round.experimental !== 1) return { status: 409, error: 'AI questions are only for experimental rounds.' };
  const left = (used: number) => Math.max(0, ILLUCIA_MAX_QUESTIONS - used);
  const limits = aiLimits(env);
  if (!limits.enabled) return { ok: false, reason: 'disabled', questionsLeft: left(round.ai_questions) };
  if (round.ai_questions >= ILLUCIA_MAX_QUESTIONS) return { ok: false, reason: 'round-limit', questionsLeft: 0 };

  const input = questionInput('invent', candidates, { maxTokens: AI_MAX_TOKENS });
  // Worst case: every prompt byte a token, plus template overhead, and every allowed output token.
  const reservation = neuronsFor(new TextEncoder().encode(JSON.stringify(input.messages)).length + 256, AI_MAX_TOKENS);
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

  // Replace the reservation with measured usage when it arrives, even after a timeout.
  type Usage = { prompt_tokens?: number | null; completion_tokens?: number | null } | null | undefined;
  const settle = async (usage: Usage) => {
    if (!Number.isInteger(usage?.prompt_tokens) || !Number.isInteger(usage?.completion_tokens)) return;
    await db.prepare('UPDATE ai_budget SET neurons = MAX(0, neurons - ? + ?) WHERE day = ?')
      .bind(reservation, neuronsFor(usage!.prompt_tokens!, usage!.completion_tokens!), day).run();
  };
  const started = Date.now();
  const call = (env.AI as AiRunner).run(AI_MODEL, input).then(readReply, () => null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<'timeout'>(resolve => { timer = setTimeout(() => resolve('timeout'), timeoutMs); });
  const result = await Promise.race([call, timedOut]);
  if (timer !== undefined) clearTimeout(timer);
  const log = (outcome: string) => console.log(JSON.stringify({ event: 'illucia_ai', outcome, ms: Date.now() - started }));
  if (result === 'timeout') {
    defer(call.then(late => settle(late?.usage ?? null)).catch(() => {}));
    log('timeout');
    return { ok: false, reason: 'timeout', questionsLeft };
  }
  await settle(result?.usage ?? null);
  if (!result) {
    log('unavailable');
    return { ok: false, reason: 'unavailable', questionsLeft };
  }
  const verdict = validateReply(result.response, candidates, { mode: 'invent' });
  if (verdict.outcome !== 'accepted'
    || questionVocabularyProblems(verdict.question, (word: string) => illuciaWordSize(word) !== null).length) {
    log('invalid');
    return { ok: false, reason: 'invalid', questionsLeft };
  }
  log('accepted');
  // An accepted reply always has both lists.
  return { ok: true, question: String(verdict.question).trim(), yes: verdict.yes as string[], no: verdict.no as string[], questionsLeft };
}
