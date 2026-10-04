// The experimental AI mode log (migration 0009): one row per question attempt, with the
// board, her candidates, what each model did and, later, the player's answer. For reading
// after days of live play (tools/read-illucia-ai-log.js). No username is stored.
import { MAX_MISSES } from '../../shared/hangman-core.js';
import type { AiTrace, AskOutcome } from './illucia-ai';

// The letters guessed so far, in order: distinct a–z, at most 26.
export const isGuessList = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 26
  && value.every(letter => typeof letter === 'string' && /^[a-z]$/.test(letter)) && new Set(value).size === value.length;

type LogInput = {
  now: number; roundId: string; candidates: string[]; guesses: string[] | null; trace: AiTrace;
  round: { word: string; seq: number; tier: string; length: number };
  result: Exclude<AskOutcome, { status: 409 }>;
};

const text = (words: string[] | null | undefined) => (words ? words.join(' ') : null);

export async function writeAiLog(db: D1Database, { now, roundId, candidates, guesses, trace, round, result }: LogInput) {
  const id = crypto.randomUUID();
  const { word } = round;
  // The board, worked out from the round's word and the letters the page says were guessed.
  const missed = guesses ? guesses.filter(letter => !word.includes(letter)) : null;
  const pattern = guesses ? [...word].map(letter => (guesses.includes(letter) ? letter : '_')).join('') : null;
  const yes = result.ok ? result.yes : null;
  const no = result.ok ? result.no : null;
  const side = yes?.includes(word) ? 'yes' : no?.includes(word) ? 'no' : null;
  await db.prepare(`INSERT INTO illucia_ai_log (id, created_at, round_id, round_seq, tier, word, word_length, turn, guesses,
      pattern, missed, misses_left, candidate_count, candidates, model_key, inventor, sorter, outcome, reason, question,
      question_problems, invent_ms, sort_ms, total_ms, invent_yes, yes_words, yes_count, no_count, yes_share, word_side,
      probabilities, invent_neurons, sort_neurons)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, now, roundId, round.seq, round.tier, word, round.length, guesses?.length ?? null, guesses ? guesses.join('') : null,
      pattern, missed ? missed.join('') : null, missed ? MAX_MISSES - missed.length : null, candidates.length, text(candidates),
      trace.modelKey ?? null, trace.inventor ?? null, trace.sorter ?? null, trace.outcome ?? (result.ok ? 'accepted' : result.reason),
      result.ok ? null : result.reason, trace.question ?? null,
      trace.questionProblems?.length ? trace.questionProblems.join(' ') : null,
      trace.inventMs ?? null, trace.sortMs ?? null, Date.now() - now, text(trace.inventYes),
      text(yes), yes?.length ?? null, no?.length ?? null, yes ? yes.length / candidates.length : null, side,
      trace.probabilities ? JSON.stringify(trace.probabilities) : null, trace.inventNeurons ?? null, trace.sortNeurons ?? null)
    .run();
  return id;
}

// Only an accepted question, in a round of this player, and only once.
export async function recordAiAnswer(db: D1Database, userId: string, roundId: string, logId: string, answer: 'yes' | 'no' | 'declined') {
  const { meta } = await db.prepare(`UPDATE illucia_ai_log SET answer = ?, answered_at = ?
    WHERE id = ? AND round_id = ? AND outcome = 'accepted' AND answer IS NULL
    AND EXISTS (SELECT 1 FROM illucia_rounds WHERE id = ? AND user_id = ?)`)
    .bind(answer, Date.now(), logId, roundId, roundId, userId).run();
  return meta.changes === 1;
}
