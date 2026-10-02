import { applyGuess, createRound, getRoundStatus } from '../../shared/hangman-core.js';
import {
  ILLUCIA_LADDER_BONUS, ILLUCIA_MAX_QUESTIONS, ILLUCIA_MIN_ROUND_DURATION_MS, ILLUCIA_MIN_WORD_LENGTH, ILLUCIA_NO_POINTS, ILLUCIA_TIERS,
  ROUND_TOO_EARLY, illuciaStumpPoints,
} from '../../shared/scoring-protocol.js';
import { illuciaWordSize } from './illucia-words';
import { ROUND_LIFETIME_MS } from './rounds';

export type IlluciaTier = 'apprentice' | 'scholar' | 'master';
export const isIlluciaTier = (value: unknown): value is IlluciaTier => ILLUCIA_TIERS.some(tier => tier.id === value);

export type IlluciaPoints = { eligible: boolean; stump: number; reason?: string };

// What a win would pay before any question multiplier, in the order the reasons are checked.
export function previewPoints(word: string, tier: IlluciaTier, experimental: boolean, paidPoints: number | null): IlluciaPoints {
  const size = illuciaWordSize(word);
  if (size === null) throw new Error('Round word is not an accepted Illucia word.');
  if (experimental) return { eligible: false, stump: 0, reason: ILLUCIA_NO_POINTS.experimental };
  if (size > ILLUCIA_TIERS.find(candidate => candidate.id === tier)!.maxSize) {
    return { eligible: false, stump: 0, reason: ILLUCIA_NO_POINTS.outsideTier };
  }
  if (paidPoints !== null && paidPoints > 0) return { eligible: false, stump: 0, reason: ILLUCIA_NO_POINTS.alreadyWon };
  return { eligible: true, stump: illuciaStumpPoints(tier, word.length, 0) };
}

type LadderRow = { ladder_rung: number; ladder_length: number | null; ladder_seq: number | null };
export type LadderView = { rung: number; next: IlluciaTier; minLength: number };
const LADDER: readonly IlluciaTier[] = ['apprentice', 'scholar', 'master'];

// The ladder is alive only for the round numbered right after its last step, so a
// loss, an abandoned or expired round, or any round in between resets it unseen.
export function ladderFor(row: LadderRow, seq: number): LadderView {
  if (row.ladder_rung === 0 || row.ladder_seq !== seq - 1) return { rung: 0, next: 'apprentice', minLength: ILLUCIA_MIN_WORD_LENGTH };
  return { rung: row.ladder_rung, next: LADDER[row.ladder_rung], minLength: row.ladder_length! + 1 };
}

// Only point-earning wins climb. Apprentice always (re)starts the ladder; Scholar
// and then Master continue it with a longer word; Master pays the bonus and resets.
export function climb(row: LadderRow, seq: number, tier: IlluciaTier, length: number, paid: boolean) {
  const reset = { rung: 0, length: null, seq: null, bonus: 0 };
  if (!paid) return reset;
  if (tier === 'apprentice') return { rung: 1, length, seq, bonus: 0 };
  const view = ladderFor(row, seq);
  if (view.rung === 0 || tier !== view.next || length < view.minLength) return reset;
  return view.rung === 2 ? { ...reset, bonus: ILLUCIA_LADDER_BONUS } : { rung: 2, length, seq, bonus: 0 };
}

type StartInput = { word: string; tier: IlluciaTier; experimental: boolean; previousRoundId: string | null };
type OpenRound = {
  roundId: string; word: string; tier: IlluciaTier; seed: number; experimental: 0 | 1;
  issuedAt: number; expiresAt: number; paidPoints: number | null; seq: number;
} & LadderRow;

export async function startIlluciaRound(db: D1Database, userId: string, { word, tier, experimental, previousRoundId }: StartInput) {
  const now = Date.now();
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const mode = experimental ? 1 : 0;
  const results = await db.batch([
    db.prepare('INSERT INTO illucia_players (user_id) VALUES (?) ON CONFLICT(user_id) DO NOTHING').bind(userId),
    // The same word, tier and mode resumes the open round (reloads, retries, tabs).
    // Anything else abandons it, as does naming it as the round being left.
    db.prepare(`DELETE FROM illucia_rounds WHERE user_id = ? AND claimed_at IS NULL
      AND (expires_at <= ? OR id = ? OR word <> ? OR tier <> ? OR experimental <> ?)`)
      .bind(userId, now, previousRoundId, word, tier, mode),
    db.prepare(`UPDATE illucia_players SET round_seq = round_seq + 1 WHERE user_id = ?
      AND NOT EXISTS (SELECT 1 FROM illucia_rounds WHERE user_id = ? AND claimed_at IS NULL)`).bind(userId, userId),
    // As in Hangman, never issue a ticket earlier than this account's last Illucia award.
    db.prepare(`INSERT INTO illucia_rounds (id, user_id, seq, word, tier, seed, experimental, issued_at, expires_at)
      SELECT ?, ?, (SELECT round_seq FROM illucia_players WHERE user_id = ?), ?, ?, ?, ?,
        MAX(?, COALESCE(MAX(claimed_at), 0)), MAX(?, COALESCE(MAX(claimed_at), 0)) + ?
      FROM illucia_rounds WHERE user_id = ?
      ON CONFLICT(user_id) WHERE claimed_at IS NULL DO NOTHING`)
      .bind(crypto.randomUUID(), userId, userId, word, tier, seed, mode, now, now, ROUND_LIFETIME_MS, userId),
    db.prepare(`SELECT id AS roundId, word, tier, seed, experimental, issued_at AS issuedAt, expires_at AS expiresAt, seq,
        (SELECT points FROM illucia_beaten_words WHERE user_id = illucia_rounds.user_id AND word = illucia_rounds.word) AS paidPoints,
        ladder_rung, ladder_length, ladder_seq
      FROM illucia_rounds JOIN illucia_players USING (user_id) WHERE user_id = ? AND claimed_at IS NULL`).bind(userId),
  ]);
  const round = results[4].results[0] as OpenRound;
  return {
    roundId: round.roundId, word: round.word, tier: round.tier, experimental: round.experimental === 1, seed: round.seed,
    issuedAt: round.issuedAt, expiresAt: round.expiresAt, serverNow: Date.now(),
    points: previewPoints(round.word, round.tier, round.experimental === 1, round.paidPoints),
    ladder: ladderFor(round, round.seq),
  };
}

// Her guesses are client-reported and not replayed: the server checks only that
// they are legal and that the sixth miss is the last guess, with the word unsolved.
export function isLosingReplay(word: string, guesses: unknown): guesses is string[] {
  if (!Array.isArray(guesses) || guesses.length < 6 || guesses.length > 26) return false;
  let round = createRound(word);
  for (const guess of guesses) {
    if (typeof guess !== 'string' || !/^[a-z]$/.test(guess) || round.guesses.includes(guess)
      || getRoundStatus(round) !== 'playing') return false;
    round = applyGuess(round, guess);
  }
  return getRoundStatus(round) === 'failed';
}

export const isAnsweredQuestions = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= ILLUCIA_MAX_QUESTIONS;

const SCORE_CEILING = 9007199254740900;
type ClaimFailure = { error: string; status: 400 | 409; code?: string; retryAfterMs?: number };
type Claimed = { score: number; awarded: { stump: number; ladder: number }; reason?: string; ladder: LadderView };

export async function claimIlluciaRound(db: D1Database, userId: string, roundId: string, guesses: unknown, answeredQuestions: number)
  : Promise<ClaimFailure | Claimed> {
  const ticket = await db.prepare(`SELECT word, tier, experimental, seq,
      (SELECT points FROM illucia_beaten_words WHERE user_id = illucia_rounds.user_id AND word = illucia_rounds.word) AS paidPoints,
      ladder_rung, ladder_length, ladder_seq
    FROM illucia_rounds JOIN illucia_players USING (user_id) WHERE id = ? AND user_id = ?`).bind(roundId, userId)
    .first<{ word: string; tier: IlluciaTier; experimental: 0 | 1; seq: number; paidPoints: number | null } & LadderRow>();
  if (!ticket) return { error: 'This round is no longer available.', status: 409 };
  if (!isLosingReplay(ticket.word, guesses)) return { error: 'The guesses must end with her sixth miss.', status: 400 };

  const preview = previewPoints(ticket.word, ticket.tier, ticket.experimental === 1, ticket.paidPoints);
  const stump = preview.eligible ? illuciaStumpPoints(ticket.tier, ticket.word.length, answeredQuestions) : 0;
  const step = climb(ticket, ticket.seq, ticket.tier, ticket.word.length, stump > 0);
  const award = stump + step.bonus;
  const now = Date.now();
  // As in Hangman: only the request whose fresh nonce consumes the ticket may
  // record the word or add points; the batch is atomic.
  const claimToken = crypto.randomUUID();
  const consumed = 'EXISTS (SELECT 1 FROM illucia_rounds WHERE id = ? AND user_id = ? AND claim_token = ?)';
  const results = await db.batch([
    // The award was computed from a read; consume only if that state still holds.
    db.prepare(`UPDATE illucia_rounds SET claimed_at = ?, claim_token = ?, stump_points = ?, ladder_points = ?, award_reason = ?
      WHERE id = ? AND user_id = ? AND claimed_at IS NULL AND expires_at > ? AND issued_at <= ?
      AND EXISTS (SELECT 1 FROM scores WHERE user_id = ? AND total <= ?)
      AND (? = 0 OR NOT EXISTS (SELECT 1 FROM illucia_beaten_words WHERE user_id = ? AND word = ? AND points > 0))
      AND EXISTS (SELECT 1 FROM illucia_players WHERE user_id = ? AND ladder_rung = ? AND ladder_seq IS ?)`)
      .bind(now, claimToken, stump, step.bonus, preview.reason ?? null, roundId, userId, now, now - ILLUCIA_MIN_ROUND_DURATION_MS,
        userId, SCORE_CEILING - award, stump, userId, ticket.word, userId, ticket.ladder_rung, ticket.ladder_seq),
    db.prepare(`UPDATE illucia_players SET ladder_rung = ?, ladder_length = ?, ladder_seq = ? WHERE user_id = ? AND ${consumed}`)
      .bind(step.rung, step.length, step.seq, userId, roundId, userId, claimToken),
    // Every normal-mode win is remembered; a word is spent only once it has paid.
    db.prepare(`INSERT INTO illucia_beaten_words (user_id, word, points, paid_round_id, beaten_at)
      SELECT ?, ?, ?, ?, ? WHERE ? = 0 AND ${consumed}
      ON CONFLICT(user_id, word) DO UPDATE SET points = excluded.points, paid_round_id = excluded.paid_round_id
      WHERE illucia_beaten_words.points = 0 AND excluded.points > 0`)
      .bind(userId, ticket.word, stump, stump > 0 ? roundId : null, now, ticket.experimental, roundId, userId, claimToken),
    db.prepare(`UPDATE scores SET total = total + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND ? > 0 AND ${consumed}`)
      .bind(award, userId, award, roundId, userId, claimToken),
    db.prepare(`SELECT illucia_rounds.claimed_at, illucia_rounds.issued_at, illucia_rounds.expires_at, illucia_rounds.stump_points,
        illucia_rounds.ladder_points, illucia_rounds.award_reason, scores.total AS score,
        illucia_players.round_seq, illucia_players.ladder_rung, illucia_players.ladder_length, illucia_players.ladder_seq
      FROM illucia_rounds JOIN scores ON scores.user_id = illucia_rounds.user_id
      JOIN illucia_players ON illucia_players.user_id = illucia_rounds.user_id
      WHERE illucia_rounds.id = ? AND illucia_rounds.user_id = ?`).bind(roundId, userId),
  ]);
  const saved = results[4].results[0] as {
    claimed_at: number | null; issued_at: number; expires_at: number; stump_points: number | null;
    ladder_points: number | null; award_reason: string | null; score: number; round_seq: number;
  } & LadderRow | undefined;
  if (saved && saved.claimed_at === null && saved.expires_at > now && now < saved.issued_at + ILLUCIA_MIN_ROUND_DURATION_MS) {
    return { error: 'The round is not ready to be claimed.', status: 409, code: ROUND_TOO_EARLY,
      retryAfterMs: saved.issued_at + ILLUCIA_MIN_ROUND_DURATION_MS - now };
  }
  if (!saved || saved.claimed_at === null) return { error: 'This round expired, was replaced, or the score limit was reached.', status: 409 };
  // The ladder as the next new round would find it.
  return { score: saved.score, awarded: { stump: saved.stump_points!, ladder: saved.ladder_points! },
    ...(saved.award_reason ? { reason: saved.award_reason } : {}), ladder: ladderFor(saved, saved.round_seq + 1) };
}
