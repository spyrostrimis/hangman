// Pure Hangman rules shared by every mode: no React, no DOM, no AI.
// A round is { answer, guesses }; everything else is derived from it.
export const MAX_MISSES = 6;

const LETTER = /^[a-z]$/;
const WORD = /^[a-z]+$/;

export function normalizeLetter(value) {
  if (typeof value !== 'string') return null;
  const letter = value.toLowerCase();
  return LETTER.test(letter) ? letter : null;
}

/** @returns {{ answer: string, guesses: string[] }} */
export function createRound(answer) {
  const word = typeof answer === 'string' ? answer.toLowerCase() : '';
  if (!WORD.test(word)) throw new Error('A round answer must contain only the letters a-z.');
  return { answer: word, guesses: [] };
}

// Returns the same round object when the guess changes nothing: an invalid
// letter, a repeated letter, or a round that is already over.
export function applyGuess(round, value) {
  const letter = normalizeLetter(value);
  if (!letter || round.guesses.includes(letter) || getRoundStatus(round) !== 'playing') {
    return round;
  }
  return { answer: round.answer, guesses: [...round.guesses, letter] };
}

export function getPattern(round) {
  return [...round.answer].map(letter => (round.guesses.includes(letter) ? letter : null));
}

export function getCorrectGuesses(round) {
  return round.guesses.filter(letter => round.answer.includes(letter));
}

export function getIncorrectGuesses(round) {
  return round.guesses.filter(letter => !round.answer.includes(letter));
}

export function getRemainingMisses(round) {
  return Math.max(0, MAX_MISSES - getIncorrectGuesses(round).length);
}

export function getRoundStatus(round) {
  if ([...round.answer].every(letter => round.guesses.includes(letter))) return 'solved';
  if (getIncorrectGuesses(round).length >= MAX_MISSES) return 'failed';
  return 'playing';
}

export function getLastGuess(round) {
  const letter = round.guesses.at(-1);
  return letter ? { letter, correct: round.answer.includes(letter) } : null;
}
