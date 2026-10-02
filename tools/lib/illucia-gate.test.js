import assert from 'node:assert/strict';
import test from 'node:test';
import { binomialUpperTail, holmAdjust, pairedComparison, tierGate } from './illucia-gate.js';

// One tier's games on words w0, w1, ...; solved(i) says whether she solved word i.
const games = (count, solved) => Array.from({ length: count }, (_, i) => ({ word: `w${i}`, won: solved(i) }));

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('exact binomial tails match hand-computed values', () => {
  close(binomialUpperTail(5, 5), 1 / 32);
  close(binomialUpperTail(3, 4), 5 / 16);
  assert.equal(binomialUpperTail(0, 0), 1);
  assert.equal(binomialUpperTail(0, 7), 1);
  assert.equal(binomialUpperTail(8, 7), 0);
  // Symmetry at n = 500: P(X >= 251) = P(X <= 249), so P(X >= 250) + P(X >= 251) = 1.
  close(binomialUpperTail(250, 500) + binomialUpperTail(251, 500), 1);
});

test('paired comparison counts only discordant words and reports the win-rate difference', () => {
  const lower = games(10, i => i < 6);  // w0-w5
  const higher = games(10, i => i >= 2 && i < 9);  // w2-w8
  const result = pairedComparison(lower, higher);
  assert.equal(result.lowerOnly, 2);  // w0, w1
  assert.equal(result.higherOnly, 3);  // w6, w7, w8
  assert.equal(result.difference, 0.1);
  assert.equal(result.p, binomialUpperTail(2, 5));
  assert.throws(() => pairedComparison(lower, games(9, () => true)), /same words/);
  assert.throws(() => pairedComparison(lower, lower.map((game, i) => (i === 3 ? { ...game, word: 'x' } : game))), /word order/);
});

test('Holm adjustment is monotone and capped at one', () => {
  assert.deepEqual(holmAdjust([0.01, 0.04, 0.03]), [0.03, 0.06, 0.06]);
  assert.deepEqual(holmAdjust([0.5, 0.9]), [1, 1]);
});

test('the gate fails a clear inversion and passes an even split', () => {
  const tier = solved => games(200, solved);
  // Inversion: Apprentice solves 120, Scholar and Master solve the same 80 of them.
  const inverted = { set: 'x', slice: 'all', games: {
    apprentice: tier(i => i < 120), scholar: tier(i => i < 80), master: tier(i => i < 80) } };
  const failed = tierGate([inverted]);
  assert.equal(failed.passed, false);
  assert.deepEqual(failed.failures.map(row => `${row.higher}>${row.lower}`), ['scholar>apprentice', 'master>apprentice']);
  assert.equal(failed.failures[0].difference, -0.2);
  // Positive control on the same words: an even 10-10 split of discordant words passes.
  const even = { set: 'x', slice: 'all', games: {
    apprentice: tier(i => i < 90), scholar: tier(i => i >= 10 && i < 100), master: tier(i => i >= 10 && i < 100) } };
  const passed = tierGate([even]);
  assert.equal(passed.passed, true);
  assert.equal(passed.rows.find(row => row.lower === 'apprentice').lowerOnly, 10);
  // A higher tier far ahead never fails a one-sided test.
  const ordered = { set: 'x', slice: 'all', games: {
    apprentice: tier(i => i < 20), scholar: tier(i => i < 100), master: tier(i => i < 180) } };
  assert.equal(tierGate([ordered]).passed, true);
});

test('Holm correction turns a lone borderline inversion into a near miss', () => {
  // Five words only Apprentice solves: raw p = 1/32 < 0.05.
  const borderline = { set: 'x', slice: 'one', games: {
    apprentice: games(20, i => i < 5), scholar: games(20, () => false), master: games(20, i => i < 5) } };
  const alone = tierGate([borderline]);
  // Within one cell there are three comparisons; the 1/32 one needs <= 0.05/3 after correction.
  const row = alone.rows.find(value => value.higher === 'scholar');
  assert.equal(row.p, 0.03125);
  assert.equal(row.holmP, 0.09375);
  assert.equal(row.fails, false);
  assert.equal(row.nearMiss, true);
  assert.equal(alone.passed, true);
  // Positive control: the same split with ten such words is beyond noise even after correction.
  const clear = { set: 'x', slice: 'one', games: {
    apprentice: games(20, i => i < 10), scholar: games(20, () => false), master: games(20, i => i < 10) } };
  assert.equal(tierGate([clear]).passed, false);
});

test('with shared seeds, words compare by win fraction (v2 A2)', () => {
  // Per word over 8 seeds: the lower tier is ahead on 12 words, the higher tier on 2, equal on 6.
  const fractions = (values) => values.map((won, i) => ({ word: `w${i}`, won }));
  const lower = fractions([...Array(12).fill(0.75), 0.5, 0.5, ...Array(6).fill(0.5)]);
  const higher = fractions([...Array(12).fill(0.5), 0.75, 0.625, ...Array(6).fill(0.5)]);
  const result = pairedComparison(lower, higher);
  assert.equal(result.lowerOnly, 12);
  assert.equal(result.higherOnly, 2);
  close(result.p, binomialUpperTail(12, 14));
  close(result.difference, (0.5 * 12 + 0.75 + 0.625 + 3 - (0.75 * 12 + 1 + 3)) / 20);
  // With booleans the same function is the McNemar test (positive control).
  const flat = pairedComparison(games(4, i => i < 3), games(4, i => i === 3));
  assert.deepEqual([flat.lowerOnly, flat.higherOnly], [3, 1]);
});
