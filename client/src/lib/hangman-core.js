export const MAX_STRIKES = 6;

export function normalizeLetter(char) {
  if (typeof char !== 'string' || char.length !== 1) return null;
  const upper = char.toUpperCase();
  return /^[A-Z]$/.test(upper) ? upper : null;
}

export function normalizeWord(word) {
  if (typeof word !== 'string') return null;
  const trimmed = word.trim().toUpperCase();
  return /^[A-Z]+$/.test(trimmed) ? trimmed : null;
}

export function createGameState(secretWord) {
  const normalized = normalizeWord(secretWord);
  if (!normalized) {
    throw new Error('Secret word must contain only A-Z letters.');
  }

  return {
    secretWord: normalized,
    wordLength: normalized.length,
    pattern: Array(normalized.length).fill(null),
    guessedLetters: [],
    hits: [],
    misses: [],
    strikesLeft: MAX_STRIKES,
    status: 'playing',
  };
}

export function applyGuess(state, rawLetter) {
  if (!state || state.status !== 'playing') {
    return state;
  }

  const letter = normalizeLetter(rawLetter);
  if (!letter || state.guessedLetters.includes(letter)) {
    return state;
  }

  const isHit = state.secretWord.includes(letter);
  const nextGuessed = [...state.guessedLetters, letter];
  const nextHits = isHit ? [...state.hits, letter] : state.hits;
  const nextMisses = !isHit ? [...state.misses, letter] : state.misses;
  const nextStrikesLeft = isHit ? state.strikesLeft : state.strikesLeft - 1;

  const nextPattern = state.secretWord.split('').map((char) => {
    return nextHits.includes(char) ? char : null;
  });

  const isWon = nextPattern.every((char) => char !== null);
  const isLost = !isWon && nextStrikesLeft <= 0;

  return {
    ...state,
    pattern: nextPattern,
    guessedLetters: nextGuessed,
    hits: nextHits,
    misses: nextMisses,
    strikesLeft: nextStrikesLeft,
    status: isWon ? 'won' : isLost ? 'lost' : 'playing',
  };
}

export function getDisplayPattern(state) {
  if (!state || !Array.isArray(state.pattern)) return '';
  return state.pattern.map((c) => (c !== null ? c : '_')).join(' ');
}
