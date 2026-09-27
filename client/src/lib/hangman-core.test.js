import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_MISSES,
  applyGuess,
  createRound,
  getCorrectGuesses,
  getIncorrectGuesses,
  getLastGuess,
  getPattern,
  getRemainingMisses,
  getRoundStatus,
  normalizeLetter,
} from './hangman-core.js';

const guessAll = (round, letters) => [...letters].reduce(applyGuess, round);

test('createRound normalizes the answer and rejects anything but a-z', () => {
  assert.deepEqual(createRound('Puzzle'), { answer: 'puzzle', guesses: [] });
  for (const bad of ['', 'hurdy-gurdy', 'two words', 'café', 42, null]) {
    assert.throws(() => createRound(bad), /only the letters a-z/);
  }
});

test('normalizeLetter accepts one a-z letter in either case', () => {
  assert.equal(normalizeLetter('e'), 'e');
  assert.equal(normalizeLetter('E'), 'e');
  for (const bad of ['', 'ee', '1', ' ', 'é', undefined]) assert.equal(normalizeLetter(bad), null);
});

test('a hit reveals every occurrence and costs nothing', () => {
  const round = applyGuess(createRound('puzzle'), 'z');
  assert.deepEqual(getPattern(round), [null, null, 'z', 'z', null, null]);
  assert.equal(getRemainingMisses(round), MAX_MISSES);
  assert.deepEqual(getLastGuess(round), { letter: 'z', correct: true });
});

test('a miss reveals nothing and costs one', () => {
  const round = applyGuess(createRound('puzzle'), 'A');
  assert.deepEqual(getPattern(round), Array(6).fill(null));
  assert.equal(getRemainingMisses(round), MAX_MISSES - 1);
  assert.deepEqual(getIncorrectGuesses(round), ['a']);
  assert.deepEqual(getLastGuess(round), { letter: 'a', correct: false });
});

test('uppercase, repeated and invalid guesses', () => {
  const start = createRound('puzzle');
  const hit = applyGuess(start, 'Z');
  assert.deepEqual(getCorrectGuesses(hit), ['z']);
  assert.equal(applyGuess(hit, 'z'), hit);
  assert.equal(applyGuess(hit, 'Z'), hit);
  assert.equal(applyGuess(hit, '1'), hit);
  assert.equal(applyGuess(hit, 'zz'), hit);
  // Positive control: a new valid letter does change the round.
  assert.notEqual(applyGuess(hit, 'p'), hit);
  // The input round is never mutated.
  assert.deepEqual(start.guesses, []);
});

test('the round is solved once every distinct letter is found', () => {
  const almost = guessAll(createRound('puzzle'), 'puzl');
  assert.equal(getRoundStatus(almost), 'playing');
  const solved = applyGuess(almost, 'e');
  assert.equal(getRoundStatus(solved), 'solved');
  assert.equal(applyGuess(solved, 'a'), solved);
});

test('the round fails on the sixth miss, not the fifth', () => {
  const fiveMisses = guessAll(createRound('puzzle'), 'abcdf');
  assert.equal(getRoundStatus(fiveMisses), 'playing');
  assert.equal(getRemainingMisses(fiveMisses), 1);
  const failed = applyGuess(fiveMisses, 'g');
  assert.equal(getRoundStatus(failed), 'failed');
  assert.equal(getRemainingMisses(failed), 0);
  assert.equal(applyGuess(failed, 'p'), failed);
});

test('hits never count toward the six misses', () => {
  const round = guessAll(createRound('puzzle'), 'abcdfpuzl');
  assert.equal(getIncorrectGuesses(round).length, 5);
  assert.equal(getRoundStatus(round), 'playing');
  assert.equal(getLastGuess(createRound('puzzle')), null);
});
