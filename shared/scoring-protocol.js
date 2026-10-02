export const MIN_ROUND_DURATION_MS = 5000;
export const ROUND_TOO_EARLY = 'ROUND_TOO_EARLY';

// Illucia (Play vs AI) scoring. Tier ceilings are ESDB sizes and must match the
// browser's VOCABULARY_TIERS; a server test checks that.
export const ILLUCIA_MIN_ROUND_DURATION_MS = 15000;
export const ILLUCIA_MIN_WORD_LENGTH = 4;
export const ILLUCIA_MAX_WORD_LENGTH = 15;
export const ILLUCIA_MAX_QUESTIONS = 2;
export const ILLUCIA_LADDER_BONUS = 100;
export const ILLUCIA_NOT_ACCEPTED_WORD = 'NOT_ACCEPTED_WORD';
export const ILLUCIA_ALREADY_WON_MESSAGE = 'You already beat me with this word, no more points from it.';
// Why a round pays no stump points, in the order they are checked.
export const ILLUCIA_NO_POINTS = Object.freeze({
  experimental: 'EXPERIMENTAL', outsideTier: 'OUTSIDE_TIER', alreadyWon: 'ALREADY_WON',
});
export const ILLUCIA_TIERS = Object.freeze([
  Object.freeze({ id: 'apprentice', maxSize: 35, base: 30 }),
  Object.freeze({ id: 'scholar', maxSize: 50, base: 40 }),
  Object.freeze({ id: 'master', maxSize: 70, base: 50 }),
]);

// Stump points: tier base × min(length − 3, 3); each answered question adds a
// half (×1.5 for one, ×2 for two). Math.round keeps whole points if bases change.
export function illuciaStumpPoints(tierId, length, answeredQuestions = 0) {
  const tier = ILLUCIA_TIERS.find(candidate => candidate.id === tierId);
  if (!tier || !Number.isInteger(length) || length < ILLUCIA_MIN_WORD_LENGTH || length > ILLUCIA_MAX_WORD_LENGTH
    || !Number.isInteger(answeredQuestions) || answeredQuestions < 0 || answeredQuestions > ILLUCIA_MAX_QUESTIONS) {
    throw new RangeError('Invalid Illucia scoring input.');
  }
  return Math.round(tier.base * Math.min(length - 3, 3) * (2 + answeredQuestions) / 2);
}
