import test from "node:test";
import assert from "node:assert/strict";

import {
  filterCandidates,
  getUnusedLetters,
  getCandidateLetterFrequencies,
  getLetterEntropy,
  chooseNextGuess,
} from "./illucia-solver.js";

test("getUnusedLetters returns letters not present in guessedLetters", () => {
  const unused = getUnusedLetters(["E", "a", "T"]);
  assert.equal(unused.includes("E"), false);
  assert.equal(unused.includes("A"), false);
  assert.equal(unused.includes("T"), false);
  assert.equal(unused.includes("B"), true);
  assert.equal(unused.length, 23);
});

test("filterCandidates accurately filters candidates by pattern, hits, and misses", () => {
  const sampleWords = ["ESCAPE", "ENGAGE", "ESTATE", "BANANA", "ROBOTS", "EAGLES"];

  // Pattern: E _ _ _ _ E, Misses: ['T']
  const pattern = ["E", null, null, null, null, "E"];
  const misses = ["T"];

  const filtered = filterCandidates(sampleWords, pattern, misses);

  // ESCAPE -> starts with E, ends with E, no T -> KEEP
  // ENGAGE -> starts with E, ends with E, no T -> KEEP
  // ESTATE -> has T -> REJECT
  // BANANA -> does not start with E -> REJECT
  // ROBOTS -> does not start with E -> REJECT
  // EAGLES -> does not end with E -> REJECT
  assert.deepEqual(filtered, ["ESCAPE", "ENGAGE"]);
});

test("filterCandidates rejects blank positions containing already-revealed hit letters", () => {
  const sampleWords = ["ROBOTS", "REVOTE"];
  // Target pattern: R _ _ _ _ _ (Hit letter 'R' only at index 0)
  const pattern = ["R", null, null, null, null, null];
  const misses = [];

  // A word like "RUNNER" is fine, but if R appeared again at index 4 (e.g. "RERUNS"), it would be rejected
  const testWords = ["RERUNS", "REPAIR"];
  const filtered = filterCandidates(testWords, pattern, misses);
  // Both RERUNS and REPAIR have a second R in blank positions -> rejected
  assert.deepEqual(filtered, []);
});

test("getLetterEntropy computes accurate mathematical entropy", () => {
  // 4 words: 2 have 'E' at pos 0, 2 don't have 'E' (MISS)
  const words = ["EGG", "ELF", "CAT", "DOG"];
  const metrics = getLetterEntropy(words, "E");

  // Partition: 2/4 for '0', 2/4 for 'MISS'
  // Entropy = - (0.5 * log2(0.5) + 0.5 * log2(0.5)) = 1.0
  assert.ok(Math.abs(metrics.entropy - 1.0) < 0.001);
  assert.equal(metrics.hitCount, 2);
  assert.equal(metrics.hitProbability, 0.5);
});

test("chooseNextGuess selects exact remaining word when 1 candidate left", () => {
  const candidates = ["PLANET"];
  const pattern = ["P", "L", "A", "N", "E", null];
  const guessedLetters = ["P", "L", "A", "N", "E"];

  const guess = chooseNextGuess({
    pattern,
    misses: [],
    guessedLetters,
    candidates,
  });

  assert.equal(guess.letter, "T");
  assert.equal(guess.strategy, "exact_match");
});

test("chooseNextGuess falls back to standard English frequency if 0 candidates remain", () => {
  const candidates = ["ROBOT"];
  const pattern = ["Z", "Z", "Z"]; // No candidates match this
  const guessedLetters = ["E", "T"];

  const guess = chooseNextGuess({
    pattern,
    misses: ["E", "T"],
    guessedLetters,
    candidates,
  });

  // Next in frequency after E, T is A
  assert.equal(guess.letter, "A");
  assert.equal(guess.strategy, "fallback_frequency");
});

test("chooseNextGuess shifts to survival weighting when strikes are low", () => {
  // Candidates: 9 words with 'A', 1 word with 'Z'
  // When strikesLeft = 1, Grandmaster favors high-hit-probability 'A' over rare 'Z'
  const candidates = [
    "CAT", "BAT", "HAT", "MAT", "PAT", "RAT", "SAT", "FAT", "VAT", "ZIP"
  ];
  const pattern = [null, null, null];
  const guessedLetters = [];

  const guess = chooseNextGuess({
    pattern,
    misses: [],
    guessedLetters,
    candidates,
    strikesLeft: 1,
    difficulty: "grandmaster",
  });

  assert.equal(guess.letter, "A");
});
