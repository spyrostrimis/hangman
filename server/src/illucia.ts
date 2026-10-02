import { ILLUCIA_NO_POINTS, ILLUCIA_TIERS, illuciaStumpPoints } from '../../shared/scoring-protocol.js';
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
