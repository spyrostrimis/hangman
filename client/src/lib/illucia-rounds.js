import { apiRequest } from './api.js';
import { isSeed } from './illucia/random.js';
import { ILLUCIA_MIN_ROUND_DURATION_MS, ROUND_TOO_EARLY } from '../../../shared/scoring-protocol.js';

// Illucia's server rounds (v2 E3). Starting a round sends the secret word to the server,
// which keeps it in the round record to check a win (disclosed on /privacy). The server
// issues her round seed, the points a win would pay, the ladder and her memory of the player.
// Points shown on the page are the server's; the page only previews the question multiplier.

const isLadder = value => value && Number.isInteger(value.rung) && typeof value.next === 'string' && Number.isInteger(value.minLength);

export async function startIlluciaRound({ word, tier, previousRoundId = null, experimental = false, signal }) {
  const ticket = await apiRequest('/user/illucia/start', { method: 'POST', signal,
    body: { word, tier, ...(experimental ? { experimental: true } : {}), ...(previousRoundId ? { previousRoundId } : {}) } });
  if (typeof ticket?.roundId !== 'string' || ticket.word !== word || ticket.tier !== tier || !isSeed(ticket.seed)
    || typeof ticket.points?.eligible !== 'boolean' || !Number.isSafeInteger(ticket.points.stump)
    || !Number.isFinite(ticket.issuedAt) || !Number.isFinite(ticket.serverNow)) {
    throw new Error('Invalid round response');
  }
  // As in Hangman: wait out the claim floor on this clock, so clock skew never shows as an error.
  const claimNotBefore = performance.now() + Math.max(0, ticket.issuedAt + ILLUCIA_MIN_ROUND_DURATION_MS - ticket.serverNow);
  return { ...ticket, ladder: isLadder(ticket.ladder) ? ticket.ladder : null, claimNotBefore };
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// A win's claim: her guesses (rules-checked, not replayed) and the number of answers that were
// checked and right. Early claims wait and retry silently.
export async function claimIlluciaRound(ticket, guesses, answeredQuestions, { stillWanted = () => true } = {}) {
  let waitMs = Math.max(0, ticket.claimNotBefore - performance.now());
  for (;;) {
    if (waitMs > 0) await pause(waitMs);
    if (!stillWanted()) return null;
    try {
      const result = await apiRequest('/user/illucia/claim', { method: 'POST',
        body: { roundId: ticket.roundId, guesses, answeredQuestions } });
      if (!Number.isSafeInteger(result?.score) || result.score < 0 || !Number.isSafeInteger(result.awarded?.stump)
        || !Number.isSafeInteger(result.awarded?.ladder)) throw new Error('Invalid claim response');
      return { ...result, ladder: isLadder(result.ladder) ? result.ladder : null };
    } catch (error) {
      if (error.code !== ROUND_TOO_EARLY || !Number.isFinite(error.retryAfterMs) || error.retryAfterMs <= 0) throw error;
      waitMs = error.retryAfterMs;
    }
  }
}

// The player's stats; E3 reads the ladder and the words that already paid, so the page can warn
// before a word is committed. Older Workers send neither, and the page then learns them from rounds.
export async function loadIlluciaStats({ signal } = {}) {
  const stats = await apiRequest('/user/illucia/stats', { signal });
  return { ...stats, ladder: isLadder(stats?.ladder) ? stats.ladder : null,
    spent: Array.isArray(stats?.spent?.words) ? stats.spent.words : null };
}

// Experimental mode (v2 E5): ask the Worker's AI route for a meaning question over her candidates
// (2-80, sorted). The model never sees the board, the player or which word is theirs. Any failure
// is { ok: false }, and she makes her normal move.
export async function askIlluciaAi({ roundId, candidates, signal }) {
  let reply;
  try {
    reply = await apiRequest('/user/illucia/ask', { method: 'POST', signal, timeout: 9000, body: { roundId, candidates } });
  } catch (error) {
    if (signal?.aborted) throw error;
    return { ok: false, reason: 'unavailable' };
  }
  if (!reply?.ok) return { ok: false, reason: typeof reply?.reason === 'string' ? reply.reason : 'invalid', questionsLeft: reply?.questionsLeft };
  // The Worker validated the sort; check again that it is a partition of what she sent.
  const known = new Set(candidates);
  const sorted = Array.isArray(reply.yes) && Array.isArray(reply.no) ? [...reply.yes, ...reply.no] : [];
  if (typeof reply.question !== 'string' || !reply.question.trim() || sorted.length !== candidates.length
    || new Set(sorted).size !== sorted.length || sorted.some(word => !known.has(word))) {
    return { ok: false, reason: 'invalid', questionsLeft: reply.questionsLeft };
  }
  return { ok: true, question: reply.question.trim(), yes: reply.yes, no: reply.no, questionsLeft: reply.questionsLeft };
}
