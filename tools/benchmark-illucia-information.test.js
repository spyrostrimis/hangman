import assert from 'node:assert/strict';
import test from 'node:test';
import { compareVariants } from './benchmark-illucia-information.js';

const words = (count, won) => Array.from({ length: count }, (_, i) => ({ word: `w${i}`, won: won(i) }));
const byTier = make => ({ apprentice: { d: make() }, scholar: { d: make() }, master: { d: make() } });

test('the information experiment flags a variant that loses words beyond noise, and passes an equal one', () => {
  const plain = byTier(() => words(100, i => (i < 60 ? 1 : 0)));
  const worse = byTier(() => words(100, i => (i < 40 ? 1 : 0))); // 20 words lost, none gained.
  const result = compareVariants(plain, worse);
  assert.equal(result.noStrengthLost, false);
  assert.ok(result.rows.every(row => row.costsStrength && row.difference < 0));
  // Positive control: the same words won by both variants cost nothing.
  assert.equal(compareVariants(plain, byTier(() => words(100, i => (i < 60 ? 1 : 0)))).noStrengthLost, true);
});
