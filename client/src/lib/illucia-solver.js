export const ENGLISH_FREQUENCY = [
  'E', 'T', 'A', 'O', 'I', 'N', 'S', 'H', 'R', 'D', 'L', 'C',
  'U', 'M', 'W', 'F', 'G', 'Y', 'P', 'B', 'V', 'K', 'J', 'X', 'Q', 'Z',
];

export function getUnusedLetters(guessedLetters = []) {
  const guessedSet = new Set(
    guessedLetters.map((l) => (typeof l === 'string' ? l.toUpperCase() : ''))
  );
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    .split('')
    .filter((letter) => !guessedSet.has(letter));
}

export function filterCandidates(candidates, pattern, misses = []) {
  if (!Array.isArray(candidates) || !Array.isArray(pattern)) return [];

  const wordLength = pattern.length;
  const missSet = new Set(misses.map((l) => l.toUpperCase()));
  const revealedHits = new Set(
    pattern.filter((c) => c !== null).map((c) => c.toUpperCase())
  );

  return candidates.filter((word) => {
    if (word.length !== wordLength) return false;

    for (let i = 0; i < wordLength; i++) {
      const char = word[i];
      const target = pattern[i];

      // If word contains a known missed letter, reject
      if (missSet.has(char)) return false;

      if (target !== null) {
        // Target is revealed at index i, so word must match target
        if (char !== target) return false;
      } else {
        // Target is blank at index i, so word cannot have a letter that was already revealed
        if (revealedHits.has(char)) return false;
      }
    }
    return true;
  });
}

export function getCandidateLetterFrequencies(candidates, unusedLetters) {
  const unusedSet = new Set(unusedLetters);
  const counts = {};

  for (const letter of unusedSet) {
    counts[letter] = 0;
  }

  for (let i = 0; i < candidates.length; i++) {
    const word = candidates[i];
    const seenInWord = new Set();
    for (let j = 0; j < word.length; j++) {
      const char = word[j];
      if (unusedSet.has(char) && !seenInWord.has(char)) {
        seenInWord.add(char);
        counts[char] = (counts[char] || 0) + 1;
      }
    }
  }

  const total = candidates.length;
  return unusedLetters.map((letter) => ({
    letter,
    count: counts[letter] || 0,
    probability: total > 0 ? (counts[letter] || 0) / total : 0,
  }));
}

export function getLetterEntropy(candidates, letter) {
  if (!candidates || candidates.length === 0) return 0;

  const total = candidates.length;
  const buckets = {};

  for (let i = 0; i < total; i++) {
    const word = candidates[i];
    const positions = [];
    for (let j = 0; j < word.length; j++) {
      if (word[j] === letter) {
        positions.push(j);
      }
    }
    const key = positions.length > 0 ? positions.join(',') : 'MISS';
    buckets[key] = (buckets[key] || 0) + 1;
  }

  let entropy = 0;
  for (const count of Object.values(buckets)) {
    const p = count / total;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  const hitCount = total - (buckets['MISS'] || 0);
  return {
    letter,
    entropy,
    hitCount,
    hitProbability: hitCount / total,
  };
}

export function chooseNextGuess({
  pattern,
  misses = [],
  guessedLetters = [],
  candidates = [],
  difficulty = 'grandmaster',
  strikesLeft = 6,
  random = Math.random,
}) {
  const unused = getUnusedLetters(guessedLetters);
  if (unused.length === 0) return null;

  const matching = filterCandidates(candidates, pattern, misses);

  // If no matching candidates remain in dictionary, fall back to global English letter frequency
  if (matching.length === 0) {
    for (const letter of ENGLISH_FREQUENCY) {
      if (unused.includes(letter)) {
        return {
          letter,
          remainingCandidates: 0,
          confidence: 0.1,
          strategy: 'fallback_frequency',
        };
      }
    }
    return { letter: unused[0], remainingCandidates: 0, confidence: 0, strategy: 'fallback_arbitrary' };
  }

  // If exactly one word matches, guess the first unrevealed letter of that word
  if (matching.length === 1) {
    const targetWord = matching[0];
    for (let i = 0; i < targetWord.length; i++) {
      const char = targetWord[i];
      if (unused.includes(char)) {
        return {
          letter: char,
          remainingCandidates: 1,
          confidence: 1.0,
          strategy: 'exact_match',
          targetWord,
        };
      }
    }
  }

  // Novice: Frequency with noise
  if (difficulty === 'novice') {
    const freqs = getCandidateLetterFrequencies(matching, unused);
    freqs.sort((a, b) => b.count - a.count);
    const topCandidates = freqs.slice(0, 3).filter((f) => f.count > 0);
    const chosen =
      topCandidates.length > 0
        ? topCandidates[Math.floor(random() * topCandidates.length)]
        : freqs[0];

    return {
      letter: chosen.letter,
      remainingCandidates: matching.length,
      confidence: chosen.probability,
      strategy: 'novice_frequency_sample',
    };
  }

  // Scholar: Pure candidate frequency
  if (difficulty === 'scholar') {
    const freqs = getCandidateLetterFrequencies(matching, unused);
    freqs.sort((a, b) => b.count - a.count);
    const best = freqs[0];

    return {
      letter: best.letter,
      remainingCandidates: matching.length,
      confidence: best.probability,
      strategy: 'scholar_frequency',
    };
  }

  // Grandmaster (Default): Risk-Weighted Shannon Entropy
  // Lambda scales survival weight as strikes decrease:
  // strikesLeft >= 4 -> lambda = 0 (pure entropy exploration)
  // strikesLeft = 3 -> lambda = 0.8
  // strikesLeft = 2 -> lambda = 1.8
  // strikesLeft = 1 -> lambda = 3.5 (high survival defense)
  let lambda = 0;
  if (strikesLeft === 3) lambda = 0.8;
  else if (strikesLeft === 2) lambda = 1.8;
  else if (strikesLeft <= 1) lambda = 3.5;

  let bestScore = -Infinity;
  let bestLetter = unused[0];
  let bestMetrics = null;

  for (const letter of unused) {
    const metrics = getLetterEntropy(matching, letter);
    const score = metrics.entropy + lambda * metrics.hitProbability;

    if (score > bestScore) {
      bestScore = score;
      bestLetter = letter;
      bestMetrics = metrics;
    }
  }

  return {
    letter: bestLetter,
    remainingCandidates: matching.length,
    confidence: bestMetrics ? bestMetrics.hitProbability : 0.5,
    entropy: bestMetrics ? bestMetrics.entropy : 0,
    strategy: 'grandmaster_risk_entropy',
  };
}
