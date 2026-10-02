import { applyGuess, createRound, getRoundStatus } from '../../shared/hangman-core.js';
import {
  ILLUCIA_MAX_QUESTIONS, ILLUCIA_MIN_ROUND_DURATION_MS, ILLUCIA_NO_POINTS, ILLUCIA_TIERS, ROUND_TOO_EARLY, illuciaStumpPoints,
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

type StartInput = { word: string; tier: IlluciaTier; experimental: boolean; previousRoundId: string | null };
type OpenRound = {
  roundId: string; word: string; tier: IlluciaTier; seed: number; experimental: 0 | 1;
  issuedAt: number; expiresAt: number; paidPoints: number | null;
};

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
    db.prepare(`SELECT id AS roundId, word, tier, seed, experimental, issued_at AS issuedAt, expires_at AS expiresAt,
        (SELECT points FROM illucia_beaten_words WHERE user_id = illucia_rounds.user_id AND word = illucia_rounds.word) AS paidPoints
      FROM illucia_rounds WHERE user_id = ? AND claimed_at IS NULL`).bind(userId),
  ]);
  const round = results[4].results[0] as OpenRound;
  return {
    roundId: round.roundId, word: round.word, tier: round.tier, experimental: round.experimental === 1, seed: round.seed,
    issuedAt: round.issuedAt, expiresAt: round.expiresAt, serverNow: Date.now(),
    points: previewPoints(round.word, round.tier, round.experimental === 1, round.paidPoints),
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
type Claimed = { score: number; awarded: { stump: number; ladder: number }; reason?: string };

export async function claimIlluciaRound(db: D1Database, userId: string, roundId: string, guesses: unknown, answeredQuestions: number)
  : Promise<ClaimFailure | Claimed> {
  const ticket = await db.prepare(`SELECT word, tier, experimental,
      (SELECT points FROM illucia_beaten_words WHERE user_id = illucia_rounds.user_id AND word = illucia_rounds.word) AS paidPoints
    FROM illucia_rounds WHERE id = ? AND user_id = ?`).bind(roundId, userId)
    .first<{ word: string; tier: IlluciaTier; experimental: 0 | 1; paidPoints: number | null }>();
  if (!ticket) return { error: 'This round is no longer available.', status: 409 };
  if (!isLosingReplay(ticket.word, guesses)) return { error: 'The guesses must end with her sixth miss.', status: 400 };

  const preview = previewPoints(ticket.word, ticket.tier, ticket.experimental === 1, ticket.paidPoints);
  const stump = preview.eligible ? illuciaStumpPoints(ticket.tier, ticket.word.length, answeredQuestions) : 0;
  const award = stump;
  const now = Date.now();
  // As in Hangman: only the request whose fresh nonce consumes the ticket may
  // record the word or add points; the batch is atomic.
  const claimToken = crypto.randomUUID();
  const consumed = 'EXISTS (SELECT 1 FROM illucia_rounds WHERE id = ? AND user_id = ? AND claim_token = ?)';
  const results = await db.batch([
    db.prepare(`UPDATE illucia_rounds SET claimed_at = ?, claim_token = ?, stump_points = ?, ladder_points = 0, award_reason = ?
      WHERE id = ? AND user_id = ? AND claimed_at IS NULL AND expires_at > ? AND issued_at <= ?
      AND EXISTS (SELECT 1 FROM scores WHERE user_id = ? AND total <= ?)
      AND (? = 0 OR NOT EXISTS (SELECT 1 FROM illucia_beaten_words WHERE user_id = ? AND word = ? AND points > 0))`)
      .bind(now, claimToken, stump, preview.reason ?? null, roundId, userId, now, now - ILLUCIA_MIN_ROUND_DURATION_MS,
        userId, SCORE_CEILING - award, stump, userId, ticket.word),
    // Every normal-mode win is remembered; a word is spent only once it has paid.
    db.prepare(`INSERT INTO illucia_beaten_words (user_id, word, points, paid_round_id, beaten_at)
      SELECT ?, ?, ?, ?, ? WHERE ? = 0 AND ${consumed}
      ON CONFLICT(user_id, word) DO UPDATE SET points = excluded.points, paid_round_id = excluded.paid_round_id
      WHERE illucia_beaten_words.points = 0 AND excluded.points > 0`)
      .bind(userId, ticket.word, stump, stump > 0 ? roundId : null, now, ticket.experimental, roundId, userId, claimToken),
    db.prepare(`UPDATE scores SET total = total + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND ? > 0 AND ${consumed}`)
      .bind(award, userId, award, roundId, userId, claimToken),
    db.prepare(`SELECT illucia_rounds.claimed_at, illucia_rounds.issued_at, illucia_rounds.expires_at, illucia_rounds.stump_points,
        illucia_rounds.ladder_points, illucia_rounds.award_reason, scores.total AS score
      FROM illucia_rounds JOIN scores ON scores.user_id = illucia_rounds.user_id
      WHERE illucia_rounds.id = ? AND illucia_rounds.user_id = ?`).bind(roundId, userId),
  ]);
  const saved = results[3].results[0] as {
    claimed_at: number | null; issued_at: number; expires_at: number; stump_points: number | null;
    ladder_points: number | null; award_reason: string | null; score: number;
  } | undefined;
  if (saved && saved.claimed_at === null && saved.expires_at > now && now < saved.issued_at + ILLUCIA_MIN_ROUND_DURATION_MS) {
    return { error: 'The round is not ready to be claimed.', status: 409, code: ROUND_TOO_EARLY,
      retryAfterMs: saved.issued_at + ILLUCIA_MIN_ROUND_DURATION_MS - now };
  }
  if (!saved || saved.claimed_at === null) return { error: 'This round expired, was replaced, or the score limit was reached.', status: 409 };
  return { score: saved.score, awarded: { stump: saved.stump_points!, ladder: saved.ladder_points! },
    ...(saved.award_reason ? { reason: saved.award_reason } : {}) };
}
