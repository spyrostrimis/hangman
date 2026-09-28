export const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
export const VOCABULARY_TIERS = Object.freeze([
  Object.freeze({ id: 'apprentice', label: 'Apprentice', maxSize: 35 }),
  Object.freeze({ id: 'scholar', label: 'Scholar', maxSize: 50 }),
  Object.freeze({ id: 'master', label: 'Master', maxSize: 70 }),
]);

// Parses one length asset. Loading/network lifecycle belongs to the later UI slice.
export function parseLexicon(text, length) {
  if (!Number.isInteger(length) || length < 3 || length > 15) throw new RangeError('Invalid word length.');
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

export function isAcceptedWord(word, entries) {
  return typeof word === 'string' && /^[a-z]{3,15}$/.test(word) &&
    entries.some(entry => entry.word === word && entry.size <= 70);
}

export function createKnowledge(entries, maxSize = 70) {
  if (!VOCABULARY_TIERS.some(tier => tier.maxSize === maxSize)) throw new RangeError('Unknown vocabulary size.');
  const length = entries[0]?.word.length;
  if (!length || entries.some(entry => entry.word.length !== length)) {
    throw new Error('Knowledge requires one nonempty length lexicon.');
  }
  const words = Object.freeze(entries.filter(entry => entry.size <= maxSize).map(entry => entry.word));
  const frequency = Object.fromEntries([...ALPHABET].map(letter => [letter, 0]));
  for (const word of words) for (const letter of new Set(word)) frequency[letter]++;
  return Object.freeze({ length, maxSize, words, frequency: Object.freeze(frequency) });
}
