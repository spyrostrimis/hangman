import test from "node:test";
import assert from "node:assert/strict";

import {
  initDictionary,
  isValidWord,
  getWordsOfLength,
} from "./dictionary.js";

test("initDictionary initializes and caches the word set and length index", () => {
  const dict1 = initDictionary();
  assert.ok(dict1.wordSet.size > 150000);
  assert.ok(dict1.wordsByLength[6].length > 10000);

  const dict2 = initDictionary();
  assert.equal(dict1, dict2, "Subsequent calls must return the identical cached instance");
});

test("isValidWord validates English words correctly and handles casing/whitespace", () => {
  assert.equal(isValidWord("escape"), true);
  assert.equal(isValidWord("ESCAPE"), true);
  assert.equal(isValidWord("  robot  "), true);
  assert.equal(isValidWord("hangman"), true);
  assert.equal(isValidWord("cat"), true);
  assert.equal(isValidWord("illuminate"), true);

  // Invalid words or non-alphabetic
  assert.equal(isValidWord("xyzqqqww"), false);
  assert.equal(isValidWord("cat123"), false);
  assert.equal(isValidWord("dog-food"), false);
  assert.equal(isValidWord(""), false);
  assert.equal(isValidWord(null), false);
  assert.equal(isValidWord(undefined), false);

  // Length constraints: min 3, max 12
  assert.equal(isValidWord("a"), false);
  assert.equal(isValidWord("in"), false);
  assert.equal(isValidWord("electroencephalographically"), false);
});

test("getWordsOfLength returns correctly filtered arrays", () => {
  const threeLetterWords = getWordsOfLength(3);
  assert.ok(threeLetterWords.length > 900);
  assert.ok(threeLetterWords.every((w) => w.length === 3));

  const sixLetterWords = getWordsOfLength(6);
  assert.ok(sixLetterWords.length > 15000);
  assert.ok(sixLetterWords.every((w) => w.length === 6));

  assert.deepEqual(getWordsOfLength(2), []);
  assert.deepEqual(getWordsOfLength(13), []);
  assert.deepEqual(getWordsOfLength("six"), []);
});
