import { getPattern, getIncorrectGuesses, getRemainingMisses } from '../hangman-core.js';

const snapshots = new WeakSet();

// This is the sole bridge from a private round to solver input. Never spread round.
export function toPublicState(round) {
  const state = Object.freeze({
    length: round.answer.length,
    pattern: Object.freeze(getPattern(round)),
    guessedLetters: Object.freeze([...round.guesses]),
    missedLetters: Object.freeze(getIncorrectGuesses(round)),
    missesLeft: getRemainingMisses(round),
  });
  snapshots.add(state);
  return state;
}

export function assertPublicState(state) {
  if (!snapshots.has(state)) throw new TypeError('Use toPublicState(round) before calling the solver.');
}
