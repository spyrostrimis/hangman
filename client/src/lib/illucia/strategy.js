import { ALPHABET } from './lexicon.js';
import { assertPublicState } from './public-state.js';
import { filterCandidates } from './candidates.js';

export const POLICIES = Object.freeze(['frequency', 'count', 'entropy', 'risk', 'lookahead']);

// Partition by the complete set of revealed positions, including the miss bucket (0).
export function partitionWords(words, letter) {
  const buckets = new Map();
  for (const word of words) {
    let mask = 0;
    for (let i = 0; i < word.length; i++) if (word[i] === letter) mask |= 1 << i;
    if (!buckets.has(mask)) buckets.set(mask, []);
    buckets.get(mask).push(word);
  }
  return buckets;
}

function information(buckets, count) {
  let entropy = 0;
  for (const words of buckets.values()) {
    const p = words.length / count;
    entropy -= p * Math.log2(p);
  }
  const hitProbability = 1 - (buckets.get(0)?.length ?? 0) / count;
  return { entropy, hitProbability, risk: entropy * hitProbability ** 2 };
}

function compare(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > 1e-12) return a[i] > b[i];
  }
  return false; // Equal scores retain alphabetical order.
}

function solved(word, guessed) {
  return [...word].every(letter => guessed.has(letter));
}

// Exact two-turn horizon at small endgames. Value: solve probability first,
// then survival probability. Terminal losses contribute neither.
function horizon(words, guessed, missesLeft, letter, depth) {
  let wins = 0;
  let alive = 0;
  const nextGuessed = new Set([...guessed, letter]);
  for (const [mask, bucket] of partitionWords(words, letter)) {
    const remaining = missesLeft - (mask === 0 ? 1 : 0);
    const probability = bucket.length / words.length;
    if (solved(bucket[0], nextGuessed)) {
      wins += probability;
      alive += probability;
    } else if (remaining > 0) {
      if (depth === 1) {
        alive += probability;
      } else {
        let best = [-1, -1];
        for (const next of ALPHABET) {
          if (nextGuessed.has(next)) continue;
          const value = horizon(bucket, nextGuessed, remaining, next, depth - 1);
          if (compare(value, best)) best = value;
        }
        wins += probability * best[0];
        alive += probability * best[1];
      }
    }
  }
  return [wins, alive];
}

export function analyzeDecision(publicState, knowledge, policy = 'count') {
  assertPublicState(publicState);
  if (!POLICIES.includes(policy)) throw new RangeError('Unknown solver policy.');
  if (knowledge.length !== publicState.length) throw new Error('Knowledge length mismatch.');
  if (publicState.missesLeft === 0 || publicState.pattern.every(letter => letter !== null)) {
    return { letter: null, candidateCount: 0, hitCount: 0 };
  }
  const candidates = filterCandidates(publicState, knowledge.words);
  if (candidates.length === 0) {
    if (knowledge.maxSize === 70) throw new Error('Master invariant: zero candidates.');
    // Use only this tier's precomputed word-presence counts for this length.
    // All-zero scores (including an empty tier) tie alphabetically.
    const letter = [...ALPHABET].filter(value => !publicState.guessedLetters.includes(value))
      .reduce((best, value) => best === null || knowledge.frequency[value] > knowledge.frequency[best] ? value : best, null);
    return { letter, candidateCount: 0, hitCount: 0, fallback: true };
  }
  const guessed = new Set(publicState.guessedLetters);
  if (policy === 'frequency' || policy === 'count') {
    // count: each candidate adds its commonness weight to every letter it contains.
    const counts = Object.fromEntries([...ALPHABET].map(letter => [letter, 0]));
    const hits = Object.fromEntries([...ALPHABET].map(letter => [letter, 0]));
    let candidateWeight = 0;
    if (policy === 'count') {
      for (const word of candidates) {
        const weight = knowledge.weights.get(word);
        candidateWeight += weight;
        for (const letter of new Set(word)) {
          counts[letter] += weight;
          hits[letter]++;
        }
      }
    }
    const scores = policy === 'frequency' ? knowledge.frequency : counts;
    const letter = [...ALPHABET].filter(value => !guessed.has(value))
      .reduce((best, value) => best === null || scores[value] > scores[best] ? value : best, null);
    if (policy === 'frequency') {
      return { letter, candidateCount: candidates.length, hitCount: candidates.filter(word => word.includes(letter)).length };
    }
    // candidateCount and hitCount stay plain word counts; the weighted totals explain the choice.
    // share is her letter's weighted share in hundredths of a percent (an integer).
    return { letter, candidateCount: candidates.length, hitCount: hits[letter],
      weightedHits: counts[letter], candidateWeight,
      share: Math.floor(counts[letter] * 10000 / candidateWeight),
      tiedWith: [...ALPHABET].filter(value => value !== letter && !guessed.has(value) && counts[value] === counts[letter]) };
  }
  let best = null;
  for (const letter of ALPHABET) {
    if (guessed.has(letter)) continue;
    const buckets = partitionWords(candidates, letter);
    const metrics = information(buckets, candidates.length);
    const hitCount = candidates.length - (buckets.get(0)?.length ?? 0);
    let score;
    if (policy === 'entropy') score = [metrics.entropy, hitCount];
    else score = [metrics.risk, hitCount];
    if (policy === 'lookahead' && candidates.length <= 12 && publicState.missesLeft <= 2) {
      score = [...horizon(candidates, guessed, publicState.missesLeft, letter, 2), ...score];
    }
    if (!best || compare(score, best.score)) best = { letter, hitCount, score };
  }
  return { letter: best.letter, candidateCount: candidates.length, hitCount: best.hitCount };
}

// Production policy: candidate hit-counting weighted by commonness. Alternatives are benchmark-only.
export function chooseLetter(publicState, knowledge) {
  return analyzeDecision(publicState, knowledge).letter;
}
