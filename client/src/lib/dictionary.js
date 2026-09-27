import { DICTIONARY_TEXT } from '../data/dictionary-data.js';

let cachedResult = null;

export function initDictionary() {
  if (cachedResult) {
    return cachedResult;
  }

  const lines = DICTIONARY_TEXT.split('\n');
  const wordSet = new Set();
  const wordsByLength = {};

  for (let i = 0; i < lines.length; i++) {
    const word = lines[i].trim();
    if (!word) continue;

    wordSet.add(word);
    const len = word.length;
    if (!wordsByLength[len]) {
      wordsByLength[len] = [];
    }
    wordsByLength[len].push(word);
  }

  cachedResult = { wordSet, wordsByLength };
  return cachedResult;
}

export function isValidWord(rawWord) {
  if (typeof rawWord !== 'string') return false;
  const word = rawWord.trim().toUpperCase();
  if (word.length < 3 || word.length > 12) return false;
  if (!/^[A-Z]+$/.test(word)) return false;

  const { wordSet } = initDictionary();
  return wordSet.has(word);
}

export function getWordsOfLength(length) {
  if (typeof length !== 'number' || length < 3 || length > 12) {
    return [];
  }
  const { wordsByLength } = initDictionary();
  return wordsByLength[length] || [];
}
