import { isSeed } from './random.js';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

// Her memory of this player (v2 A3), from C2's `memory.brain` in the round-start response.
// Only these four fields may reach her guessing; `memory.voice` (which knows the secret word)
// and anything else must not, so any other key throws. Like toPublicState, a validated brain
// is registered privately and the solver accepts nothing else.
const brains = new WeakSet();
const FIELDS = ['games', 'learned', 'letters', 'personalitySeed'];

export function toBrain(raw, length) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('Her memory must be an object.');
  const keys = Object.keys(raw).sort();
  if (keys.length !== FIELDS.length || keys.some((key, index) => key !== FIELDS[index])) {
    throw new TypeError('Her memory may hold only personalitySeed, games, letters and learned.');
  }
  const { personalitySeed, games, letters, learned } = raw;
  if (!isSeed(personalitySeed)) throw new RangeError('personalitySeed must be an unsigned 32-bit integer.');
  if (!Number.isSafeInteger(games) || games < 0) throw new RangeError('games must be a non-negative integer.');
  if (!letters || typeof letters !== 'object' || Array.isArray(letters) ||
    Object.keys(letters).sort().join('') !== ALPHABET ||
    [...ALPHABET].some(letter => !Number.isSafeInteger(letters[letter]) || letters[letter] < 0 || letters[letter] > games)) {
    throw new RangeError('letters must count a-z plays, each between 0 and games.');
  }
  if (!Array.isArray(learned) || learned.some(word => typeof word !== 'string' || !/^[a-z]+$/.test(word) || word.length !== length) ||
    new Set(learned).size !== learned.length) {
    throw new RangeError(`learned must be distinct lowercase words of ${length} letters.`);
  }
  const brain = Object.freeze({
    personalitySeed, games,
    letters: Object.freeze(Object.fromEntries([...ALPHABET].map(letter => [letter, letters[letter]]))),
    learned: Object.freeze([...learned].sort()),
  });
  brains.add(brain);
  return brain;
}

export function assertBrain(brain) {
  if (!brains.has(brain)) throw new TypeError('Use toBrain(memory.brain, length) before her guessing sees it.');
}
