// Seeded randomness for Illucia (v2 A2). Never Math.random.
// Stateless by design: the draws depend only on (seed, turn), so a page may recompute
// a decision during render, or twice under StrictMode, and get the same letter.

export const isSeed = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;

// murmur3's 32-bit finalizer: spreads nearby seeds and turns apart.
function mix(value) {
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return value >>> 0;
}

// A stream of unsigned 32-bit draws (mulberry32) for one turn of one round.
export function randomStream(seed, turn) {
  if (!isSeed(seed)) throw new RangeError('Seed must be an unsigned 32-bit integer.');
  if (!Number.isInteger(turn) || turn < 0) throw new RangeError('Turn must be a non-negative integer.');
  let state = mix((seed ^ mix(turn + 0x9e3779b9)) >>> 0);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return (x ^ (x >>> 14)) >>> 0;
  };
}

// Index i with probability weights[i] / total. Weights are non-negative integers.
export function weightedIndex(next, weights) {
  if (!weights.length || weights.some(weight => !Number.isSafeInteger(weight) || weight < 0)) {
    throw new RangeError('Weights must be non-negative integers.');
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total === 0) throw new RangeError('At least one weight must be positive.');
  let draw = Math.floor(next() / 4294967296 * total);
  for (let index = 0; index < weights.length; index++) {
    if (draw < weights[index]) return index;
    draw -= weights[index];
  }
  throw new Error('Unreachable: draw exceeded the total.');
}

// A fresh seed for a round the server has not seeded (guests, unranked play).
export function newLocalSeed() {
  return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
}
