import { assertPublicState } from './public-state.js';

export function filterCandidates(publicState, words) {
  assertPublicState(publicState);
  const guessed = new Set(publicState.guessedLetters);
  return words.filter(word => word.length === publicState.length &&
    publicState.pattern.every((letter, index) => letter === null
      ? !guessed.has(word[index])
      : word[index] === letter));
}
