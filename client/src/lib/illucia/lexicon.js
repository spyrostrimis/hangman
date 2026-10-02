export const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
export const MIN_WORD_LENGTH = 4;
export const MAX_WORD_LENGTH = 15;
export const VOCABULARY_TIERS = Object.freeze([
  Object.freeze({ id: 'apprentice', label: 'Apprentice', maxSize: 35 }),
  Object.freeze({ id: 'scholar', label: 'Scholar', maxSize: 50 }),
  Object.freeze({ id: 'master', label: 'Master', maxSize: 70 }),
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

export function createKnowledge(entries, maxSize = 70, weightOf = commonnessWeight) {
  if (!VOCABULARY_TIERS.some(tier => tier.maxSize === maxSize)) throw new RangeError('Unknown vocabulary size.');
  const length = entries[0]?.word.length;
  if (!length || entries.some(entry => entry.word.length !== length)) {
    throw new Error('Knowledge requires one nonempty length lexicon.');
  }
  const known = entries.filter(entry => entry.size <= maxSize);
  const words = Object.freeze(known.map(entry => entry.word));
  const weights = new Map(known.map(entry => [entry.word, weightOf(entry.size)]));
  if ([...weights.values()].some(weight => !Number.isInteger(weight) || weight < 1)) {
    throw new RangeError('Commonness weights must be positive integers.');
  }
  // The zero-candidate fallback stays unweighted: it counts words, not weights.
  const frequency = Object.fromEntries([...ALPHABET].map(letter => [letter, 0]));
  for (const word of words) for (const letter of new Set(word)) frequency[letter]++;
  return Object.freeze({ length, maxSize, words, weights, frequency: Object.freeze(frequency) });
}
