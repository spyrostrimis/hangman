import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_STRIKES,
  createGameState,
  applyGuess,
  getDisplayPattern,
  normalizeLetter,
  normalizeWord,
} from "./hangman-core.js";

test("normalizeLetter and normalizeWord correctly clean inputs", () => {
  assert.equal(normalizeLetter("a"), "A");
  assert.equal(normalizeLetter("Z"), "Z");
  assert.equal(normalizeLetter("1"), null);
  assert.equal(normalizeLetter("!"), null);
  assert.equal(normalizeLetter(""), null);
  assert.equal(normalizeLetter("AB"), null);

  assert.equal(normalizeWord("escape"), "ESCAPE");
  assert.equal(normalizeWord("  RobOt  "), "ROBOT");
  assert.equal(normalizeWord("hello-world"), null);
  assert.equal(normalizeWord("123"), null);
  assert.equal(normalizeWord(""), null);
});

test("createGameState initializes a valid fresh game", () => {
  const state = createGameState("ESCAPE");

  assert.equal(state.secretWord, "ESCAPE");
  assert.equal(state.wordLength, 6);
  assert.deepEqual(state.pattern, [null, null, null, null, null, null]);
  assert.deepEqual(state.guessedLetters, []);
  assert.deepEqual(state.hits, []);
  assert.deepEqual(state.misses, []);
  assert.equal(state.strikesLeft, MAX_STRIKES);
  assert.equal(state.status, "playing");
  assert.equal(getDisplayPattern(state), "_ _ _ _ _ _");
});

test("createGameState rejects invalid or non-alphabetic words", () => {
  assert.throws(() => createGameState(""), /Secret word must contain only A-Z/);
  assert.throws(() => createGameState("test 123"), /Secret word must contain only A-Z/);
  assert.throws(() => createGameState(null), /Secret word must contain only A-Z/);
});

test("applyGuess reveals all occurrences of a hit without penalty", () => {
  let state = createGameState("ESCAPE");

  state = applyGuess(state, "e");
  assert.deepEqual(state.hits, ["E"]);
  assert.deepEqual(state.misses, []);
  assert.deepEqual(state.pattern, ["E", null, null, null, null, "E"]);
  assert.equal(state.strikesLeft, 6);
  assert.equal(state.status, "playing");
  assert.equal(getDisplayPattern(state), "E _ _ _ _ E");

  state = applyGuess(state, "A");
  assert.deepEqual(state.hits, ["E", "A"]);
  assert.deepEqual(state.pattern, ["E", null, null, "A", null, "E"]);
  assert.equal(state.strikesLeft, 6);
  assert.equal(state.status, "playing");
});

test("applyGuess consumes 1 strike per miss without revealing letters", () => {
  let state = createGameState("ESCAPE");

  state = applyGuess(state, "z");
  assert.deepEqual(state.hits, []);
  assert.deepEqual(state.misses, ["Z"]);
  assert.deepEqual(state.pattern, [null, null, null, null, null, null]);
  assert.equal(state.strikesLeft, 5);
  assert.equal(state.status, "playing");

  // Repeated guess has no effect and costs nothing
  state = applyGuess(state, "Z");
  assert.equal(state.strikesLeft, 5);
  assert.deepEqual(state.misses, ["Z"]);
});

test("applyGuess transitions to won when all distinct letters are guessed", () => {
  let state = createGameState("CAT");

  state = applyGuess(state, "c");
  state = applyGuess(state, "a");
  assert.equal(state.status, "playing");

  state = applyGuess(state, "t");
  assert.equal(state.status, "won");
  assert.equal(state.strikesLeft, 6);
  assert.deepEqual(state.pattern, ["C", "A", "T"]);
  assert.equal(getDisplayPattern(state), "C A T");

  // Subsequent guesses are ignored when won
  const frozen = applyGuess(state, "x");
  assert.equal(frozen.status, "won");
  assert.deepEqual(frozen.guessedLetters, ["C", "A", "T"]);
});

test("applyGuess transitions to lost after 6 incorrect guesses", () => {
  let state = createGameState("CAT");
  const wrongLetters = ["b", "d", "e", "f", "g", "h"];

  for (let i = 0; i < wrongLetters.length; i++) {
    state = applyGuess(state, wrongLetters[i]);
    assert.equal(state.strikesLeft, 5 - i);
    if (i < 5) {
      assert.equal(state.status, "playing");
    }
  }

  assert.equal(state.status, "lost");
  assert.equal(state.strikesLeft, 0);
  assert.deepEqual(state.misses, ["B", "D", "E", "F", "G", "H"]);

  // Subsequent guesses are ignored when lost
  const frozen = applyGuess(state, "c");
  assert.equal(frozen.status, "lost");
  assert.deepEqual(frozen.pattern, [null, null, null]);
});
