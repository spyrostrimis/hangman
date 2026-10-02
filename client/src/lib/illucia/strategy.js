import { ALPHABET, VOCABULARY_TIERS } from './lexicon.js';
import { isSeed, randomStream, weightedIndex } from './random.js';
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

const VOWELS = new Set('aeiou');

// Her personality with this player (v2 A3): small, stable variations from the account's
// personality seed. Shortlist width x 85-115% and vowel bonus x 75-125% keep the tier order
// (Master at most 4.6 points, Scholar 5.95-8.05, Apprentice at least 8.5); one favourite
// vowel gets half as much bonus again.
export function personalTemperament(temperament, personalitySeed) {
  const next = randomStream(personalitySeed, 0);
  const widthPercent = 85 + (next() % 31);
  const bonusPercent = 75 + (next() % 51);
  return Object.freeze({ ...temperament,
    shortlist: Math.floor(temperament.shortlist * widthPercent / 100),
    vowelBonus: Math.floor(temperament.vowelBonus * bonusPercent / 100),
    favouriteVowel: 'aeiou'[next() % 5] });
}

// The player's letter habits (v2 A3): weight 5% x min(1, games / 50), in hundredths of a percent.
const priorWeightFor = games => Math.floor(500 * Math.min(games, 50) / 50);

// Her temperament (v2 A2). Scores are integers: a letter's weighted hits × 10,000 plus any
// vowel bonus × the candidates' total weight, so score / total weight is its share in
// hundredths of a percent and every comparison is exact. Only letters found in at least one
// candidate are eligible, so no bonus can make her guess a letter in none of them.
// With a memory of the player (v2 A3), her personality varies the temperament and the
// player's letter habits blend in: score = (share + bonus) × (10,000 − w) + habit share × w,
// all × total weight; with w = 0 the scores are exactly the ones above.
function temperamentDecision(publicState, knowledge, candidates, guessed, baseTemperament, next) {
  const brain = knowledge.brain;
  const temperament = brain ? personalTemperament(baseTemperament, brain.personalitySeed) : baseTemperament;
  const priorWeight = brain ? priorWeightFor(brain.games) : 0;
  const habit = letter => (priorWeight ? Math.floor(brain.letters[letter] * 10000 / brain.games) : 0);
  const scale = priorWeight ? 10000 : 1;
  const counts = Object.fromEntries([...ALPHABET].map(letter => [letter, 0]));
  const hits = Object.fromEntries([...ALPHABET].map(letter => [letter, 0]));
  let candidateWeight = 0;
  for (const word of candidates) {
    const weight = knowledge.weights.get(word);
    candidateWeight += weight;
    for (const letter of new Set(word)) {
      counts[letter] += weight;
      hits[letter]++;
    }
  }
  const careful = publicState.missesLeft <= 2;
  const turn = publicState.guessedLetters.length;
  const fading = !careful && turn < temperament.vowelTurns
    ? Math.floor(temperament.vowelBonus * (temperament.vowelTurns - turn) / temperament.vowelTurns) : 0;
  const bonusFor = letter => (!VOWELS.has(letter) ? 0
    : letter === temperament.favouriteVowel ? Math.floor(fading * 3 / 2) : fading);
  const eligible = [...ALPHABET].filter(letter => !guessed.has(letter) && counts[letter] > 0);
  const score = letter => (priorWeight
    ? (counts[letter] * 10000 + bonusFor(letter) * candidateWeight) * (10000 - priorWeight)
      + habit(letter) * priorWeight * candidateWeight
    : counts[letter] * 10000 + bonusFor(letter) * candidateWeight);
  const top = Math.max(...eligible.map(score));
  const best = eligible.filter(letter => score(letter) === top);
  // Careful: strictly the best (the seed settles a tie). Exploring: letters within the
  // tier's shortlist width of the best, odds rising linearly above the cut-off.
  const cutoff = top - temperament.shortlist * candidateWeight * scale;
  const options = careful ? best : eligible.filter(letter => score(letter) > cutoff);
  let odds = careful ? options.map(() => 1) : options.map(letter => score(letter) - cutoff);
  // Information value (v2 A2, benchmark-only; no tier sets it): inside the shortlist, a letter's
  // odds rise by up to `information` percent with how well it splits the candidates (weighted
  // entropy of its reveal patterns, relative to the best on the shortlist). Never the decider.
  if (!careful && temperament.information > 0 && options.length > 1) {
    const split = options.map(letter => {
      let entropy = 0;
      for (const bucket of partitionWords(candidates, letter).values()) {
        const p = bucket.reduce((sum, word) => sum + knowledge.weights.get(word), 0) / candidateWeight;
        entropy -= p * Math.log2(p);
      }
      return entropy;
    });
    const most = Math.max(...split);
    if (most > 0) odds = odds.map((value, index) => value * (100 + Math.round(temperament.information * split[index] / most)));
  }
  const letter = options[weightedIndex(next, odds)];
  const totalOdds = odds.reduce((sum, value) => sum + value, 0);
  const shareOf = value => Math.floor(counts[value] * 10000 / candidateWeight);
  return {
    letter, mode: careful ? 'careful' : 'exploring',
    candidateCount: candidates.length, hitCount: hits[letter], weightedHits: counts[letter], candidateWeight,
    // Words that beat this player before and are still possible (v2 A3).
    learnedCandidates: candidates.filter(word => knowledge.learned.has(word)).length,
    share: shareOf(letter),
    best, choseBest: score(letter) === top,
    tiedWith: eligible.filter(value => value !== letter && score(value) === score(letter)),
    vowelBonus: bonusFor(letter),
    // The player's habits (v2 A3): their weight and her letter's habit share, hundredths of a percent.
    priorWeight, priorShare: habit(letter),
    personality: brain ? { shortlist: temperament.shortlist, vowelBonus: temperament.vowelBonus,
      vowelTurns: temperament.vowelTurns, favouriteVowel: temperament.favouriteVowel } : null,
    // What she considered, best first: share and her chance of picking it, both in hundredths of a percent.
    shortlist: options.map((value, index) => ({ letter: value, share: shareOf(value),
      chance: Math.floor(odds[index] * 10000 / totalOdds) }))
      .sort((a, b) => score(b.letter) - score(a.letter) || (a.letter < b.letter ? -1 : 1)),
  };
}

// A string selects a strict, deterministic policy (benchmarks; alphabetical ties). An options
// object selects her temperament and must carry the round seed. There is no default, so no
// caller can silently play the strict policy.
export function analyzeDecision(publicState, knowledge, policyOrOptions) {
  assertPublicState(publicState);
  if (policyOrOptions === undefined) throw new TypeError('Pass a strict policy name or { seed } for her temperament.');
  const temperamental = typeof policyOrOptions === 'object' && policyOrOptions !== null;
  const policy = temperamental ? 'count' : policyOrOptions;
  if (!POLICIES.includes(policy)) throw new RangeError('Unknown solver policy.');
  if (knowledge.length !== publicState.length) throw new Error('Knowledge length mismatch.');
  let next = null;
  let temperament = null;
  if (temperamental) {
    if (!isSeed(policyOrOptions.seed)) throw new RangeError('Her temperament needs a round seed (unsigned 32-bit).');
    next = randomStream(policyOrOptions.seed, publicState.guessedLetters.length);
    temperament = policyOrOptions.temperament ?? VOCABULARY_TIERS.find(tier => tier.maxSize === knowledge.maxSize).temperament;
  }
  if (publicState.missesLeft === 0 || publicState.pattern.every(letter => letter !== null)) {
    return { letter: null, candidateCount: 0, hitCount: 0 };
  }
  const candidates = filterCandidates(publicState, knowledge.words);
  if (candidates.length === 0) {
    if (knowledge.maxSize === 70) throw new Error('Master invariant: zero candidates.');
    // Use only this tier's precomputed word-presence counts for this length.
    // Strict: all-zero scores (including an empty tier) tie alphabetically. Temperament: the seed breaks ties.
    const unused = [...ALPHABET].filter(value => !publicState.guessedLetters.includes(value));
    const top = Math.max(...unused.map(value => knowledge.frequency[value]));
    const best = unused.filter(value => knowledge.frequency[value] === top);
    const letter = next ? best[weightedIndex(next, best.map(() => 1))] : best[0];
    return { letter, candidateCount: 0, hitCount: 0, fallback: true };
  }
  const guessed = new Set(publicState.guessedLetters);
  if (temperament) return temperamentDecision(publicState, knowledge, candidates, guessed, temperament, next);
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

// The strict weighted count (A1) for tools and tests. The pages play her temperament through
// analyzeDecision(state, knowledge, { seed }).
export function chooseLetter(publicState, knowledge) {
  return analyzeDecision(publicState, knowledge, 'count').letter;
}
