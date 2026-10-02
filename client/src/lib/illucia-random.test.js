import assert from 'node:assert/strict';
import test from 'node:test';
import { isSeed, newLocalSeed, randomStream, weightedIndex } from './illucia/random.js';

const draws = (seed, turn, count = 5) => {
  const next = randomStream(seed, turn);
  return Array.from({ length: count }, next);
};

test('a stream depends only on its seed and turn', () => {
  assert.deepEqual(draws(42, 3), draws(42, 3));
  assert.notDeepEqual(draws(42, 3), draws(42, 4));
  assert.notDeepEqual(draws(42, 3), draws(43, 3));
  assert.ok(draws(0, 0).every(value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff));
  // Pinned values: a change of generator would silently change every recorded game.
  assert.deepEqual(draws(20260928, 0, 3), [2526480179, 3049820744, 1329135313]);
  assert.equal(new Set(draws(7, 0, 1000)).size, 1000);
});

test('seeds must be unsigned 32-bit integers and turns non-negative integers', () => {
  for (const seed of [-1, 2 ** 32, 1.5, '1', null, undefined]) assert.throws(() => randomStream(seed, 0), /Seed/);
  assert.equal(isSeed(0), true);
  assert.equal(isSeed(0xffffffff), true);
  assert.doesNotThrow(() => randomStream(0xffffffff, 0)); // Positive control at the boundary.
  for (const turn of [-1, 0.5, '0']) assert.throws(() => randomStream(1, turn), /Turn/);
});

test('weighted picks follow integer weights and never pick a zero weight', () => {
  const counts = [0, 0, 0, 0];
  for (let turn = 0; turn < 8000; turn++) counts[weightedIndex(randomStream(99, turn), [1, 0, 3, 4])]++;
  assert.equal(counts[1], 0);
  assert.ok(Math.abs(counts[0] / 8000 - 1 / 8) < 0.02, `${counts}`);
  assert.ok(Math.abs(counts[2] / 8000 - 3 / 8) < 0.02, `${counts}`);
  assert.ok(Math.abs(counts[3] / 8000 - 4 / 8) < 0.02, `${counts}`);
  assert.equal(weightedIndex(randomStream(5, 0), [0, 0, 7]), 2);
  assert.throws(() => weightedIndex(randomStream(5, 0), [0, 0]), /positive/);
  assert.throws(() => weightedIndex(randomStream(5, 0), [1, 0.5]), /integers/);
  assert.throws(() => weightedIndex(randomStream(5, 0), []), /integers/);
});

test('local seeds come from crypto and are valid seeds', () => {
  const seeds = Array.from({ length: 20 }, newLocalSeed);
  assert.ok(seeds.every(isSeed));
  assert.ok(new Set(seeds).size > 1);
});
