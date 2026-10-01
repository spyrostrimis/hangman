import words from '../../tools/words.locked.json';
import { applyGuess, createRound, getRoundStatus } from '../../shared/hangman-core.js';
import { MIN_ROUND_DURATION_MS, ROUND_TOO_EARLY } from '../../shared/scoring-protocol.js';

export const ROUND_LIFETIME_MS = 30 * 60 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;
export const isRoundId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);

type Ticket = { roundId: string; word: string; issuedAt: number; expiresAt: number };

export async function startRound(db: D1Database, userId: string, previousRoundId: string | null) {
  const now = Date.now();
  const random = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
  const word = words[Math.floor(random * words.length)];
  const results = await db.batch([
    // Bounded, indexed cleanup amortized over starts; no scheduled Worker needed.
    db.prepare('DELETE FROM rounds WHERE id IN (SELECT id FROM rounds WHERE expires_at <= ? ORDER BY expires_at LIMIT 100)')
      .bind(now - RETENTION_MS),
    db.prepare('DELETE FROM rounds WHERE user_id = ? AND claimed_at IS NULL AND (expires_at <= ? OR id = ?)')
      .bind(userId, now, previousRoundId),
    // A start request can have sampled its clock before a concurrent claim.
    // Never backdate the next ticket before the preceding award in D1.
    db.prepare(`INSERT INTO rounds (id, user_id, word, issued_at, expires_at)
      SELECT ?, ?, ?, MAX(?, COALESCE(MAX(claimed_at), 0)), MAX(?, COALESCE(MAX(claimed_at), 0)) + ?
      FROM rounds WHERE user_id = ?
      ON CONFLICT(user_id) WHERE claimed_at IS NULL DO NOTHING`)
      .bind(crypto.randomUUID(), userId, word, now, now, ROUND_LIFETIME_MS, userId),
    db.prepare('SELECT id AS roundId, word, issued_at AS issuedAt, expires_at AS expiresAt FROM rounds WHERE user_id = ? AND claimed_at IS NULL').bind(userId),
  ]);
  return { ...results[3].results[0] as Ticket, serverNow: Date.now() };
}

export function isWinningReplay(word: string, guesses: unknown): guesses is string[] {
  if (!Array.isArray(guesses) || guesses.length === 0 || guesses.length > 26) return false;
  let round = createRound(word);
  for (const guess of guesses) {
    if (typeof guess !== 'string' || !/^[a-z]$/.test(guess) || round.guesses.includes(guess)
      || getRoundStatus(round) !== 'playing') return false;
    round = applyGuess(round, guess);
  }
  return getRoundStatus(round) === 'solved';
}

export async function claimRound(db: D1Database, userId: string, roundId: string, guesses: unknown): Promise<
  { error: string; status: 400 | 409; code?: string; retryAfterMs?: number } | { score: number }
> {
  const ticket = await db.prepare('SELECT word FROM rounds WHERE id = ? AND user_id = ?')
    .bind(roundId, userId).first<{ word: string }>();
  if (!ticket) return { error: 'This round is no longer available.', status: 409 as const };
  if (!isWinningReplay(ticket.word, guesses)) return { error: 'The guesses must form a valid winning round.', status: 400 as const };

  const now = Date.now();
  // Only the request that consumes the ticket may increment the score. A new
  // nonce on every attempt makes a zero-row UPDATE a no-op for the increment,
  // including retries and simultaneous claims. All three statements are atomic.
  const claimToken = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(`UPDATE rounds SET claimed_at = ?, claim_token = ?
      WHERE id = ? AND user_id = ? AND claimed_at IS NULL AND expires_at > ?
      AND issued_at <= ?
      AND EXISTS (SELECT 1 FROM scores WHERE user_id = ? AND total <= 9007199254740800)`)
      .bind(now, claimToken, roundId, userId, now, now - MIN_ROUND_DURATION_MS, userId),
    db.prepare(`UPDATE scores SET total = total + 100, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
      AND EXISTS (SELECT 1 FROM rounds WHERE id = ? AND user_id = ? AND claim_token = ?)`)
      .bind(userId, roundId, userId, claimToken),
    db.prepare(`SELECT rounds.claimed_at, rounds.issued_at, rounds.expires_at, scores.total AS score FROM rounds JOIN scores ON scores.user_id = rounds.user_id
      WHERE rounds.id = ? AND rounds.user_id = ?`).bind(roundId, userId),
  ]);
  const saved = results[2].results[0] as { claimed_at: number | null; issued_at: number; expires_at: number; score: number } | undefined;
  if (saved && saved.claimed_at === null && saved.expires_at > now && now < saved.issued_at + MIN_ROUND_DURATION_MS) {
    return { error: 'The round is not ready to be claimed.', status: 409, code: ROUND_TOO_EARLY,
      retryAfterMs: saved.issued_at + MIN_ROUND_DURATION_MS - now };
  }
  if (!saved || saved.claimed_at === null) return { error: 'This round expired, was replaced, or the score limit was reached.', status: 409 as const };
  return { score: saved.score };
}
