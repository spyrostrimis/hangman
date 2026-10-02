import { assertBrain } from './brain.js';

export const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
export const MIN_WORD_LENGTH = 4;
export const MAX_WORD_LENGTH = 15;
// Temperament (v2 A2), in hundredths of a percentage point: `shortlist` is how far below
// her best weighted share a letter may be and still be picked while she has 3+ misses
// left; the vowel bonus starts at `vowelBonus` and fades to nothing over `vowelTurns` turns.
// Apprentice is the most exploratory, Master the narrowest. Starting values, tuned under
// the tier-order gate and the strength cap (docs/ILLUCIA-STRENGTH.md).
const temperament = (shortlist, vowelBonus, vowelTurns) => Object.freeze({ shortlist, vowelBonus, vowelTurns });
export const VOCABULARY_TIERS = Object.freeze([
  Object.freeze({ id: 'apprentice', label: 'Apprentice', maxSize: 35, temperament: temperament(1000, 600, 3) }),
  Object.freeze({ id: 'scholar', label: 'Scholar', maxSize: 50, temperament: temperament(700, 400, 2) }),
  Object.freeze({ id: 'master', label: 'Master', maxSize: 70, temperament: temperament(400, 200, 1) }),
]);

// Parses one length asset. Loading/network lifecycle belongs to the later UI slice.
export function parseLexicon(text, length) {
  if (!Number.isInteger(length) || length < MIN_WORD_LENGTH || length > MAX_WORD_LENGTH) throw new RangeError('Invalid word length.');
  if (typeof text !== 'string' || !text.endsWith('\n')) throw new TypeError('Invalid lexicon text.');
  let previous = '';
  return Object.freeze(text.slice(0, -1).split('\n').map(line => {
    const match = /^([a-z]+) (35|40|50|55|60|65|70)$/.exec(line);
    if (!match || match[1].length !== length || match[1] <= previous) {
      throw new Error('Lexicon must contain sorted unique words of the requested length.');
    }
    previous = match[1];
    return Object.freeze({ word: match[1], size: Number(match[2]) });
  }));
}

// Lowercase A-Z of a playable length; whether the word is listed is a separate check.
export function isWordShape(word) {
  return typeof word === 'string' && /^[a-z]+$/.test(word) &&
    word.length >= MIN_WORD_LENGTH && word.length <= MAX_WORD_LENGTH;
}

export function isAcceptedWord(word, entries) {
  return isWordShape(word) && entries.some(entry => entry.word === word && entry.size <= 70);
}

// How much a candidate word counts, by commonness (ESDB size): <=35 -> 10, 40-50 -> 3,
// 55-70 -> 1. Integers keep sums exact (v2 decisions 1.1, Amendments 2).
export function commonnessWeight(size) {
  return size <= 35 ? 10 : size <= 50 ? 3 : 1;
}

// Words that beat her (v2 A3) join her knowledge at every tier and weigh as much as the
// commonest words: she remembers them.
export const LEARNED_WEIGHT = 10;

// `brain` is her validated memory of this player (toBrain), or null for no memory.
export function createKnowledge(entries, maxSize = 70, weightOf = commonnessWeight, brain = null) {
  if (!VOCABULARY_TIERS.some(tier => tier.maxSize === maxSize)) throw new RangeError('Unknown vocabulary size.');
  const length = entries[0]?.word.length;
  if (!length || entries.some(entry => entry.word.length !== length)) {
    throw new Error('Knowledge requires one nonempty length lexicon.');
  }
  if (brain !== null) assertBrain(brain);
  const learned = new Set(brain?.learned ?? []);
  for (const word of learned) {
    if (!entries.some(entry => entry.word === word)) throw new RangeError('Learned words must be accepted words of this length.');
  }
  const known = entries.filter(entry => entry.size <= maxSize || learned.has(entry.word));
  const words = Object.freeze(known.map(entry => entry.word));
  const weights = new Map(known.map(entry => [entry.word, learned.has(entry.word) ? LEARNED_WEIGHT : weightOf(entry.size)]));
  if ([...weights.values()].some(weight => !Number.isInteger(weight) || weight < 1)) {
    throw new RangeError('Commonness weights must be positive integers.');
  }
  // The zero-candidate fallback stays unweighted: it counts words, not weights.
  const frequency = Object.fromEntries([...ALPHABET].map(letter => [letter, 0]));
  for (const word of words) for (const letter of new Set(word)) frequency[letter]++;
  return Object.freeze({ length, maxSize, words, weights, learned, brain, frequency: Object.freeze(frequency) });
}
