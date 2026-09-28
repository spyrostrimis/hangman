import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleWords, simulate, summarize } from './benchmark-illucia.js';
import { createKnowledge, parseLexicon } from '../client/src/lib/illucia/lexicon.js';

test('seeded samples are reproducible, without replacement, and do not mutate input', () => {
  const entries = Array.from({ length: 50 }, (_, i) => i);
  const sample = sampleWords(entries, 20, 123);
  assert.deepEqual(sample, sampleWords(entries, 20, 123));
  assert.notDeepEqual(sample, sampleWords(entries, 20, 124));
  assert.equal(new Set(sample).size, 20);
  assert.deepEqual(entries, Array.from({ length: 50 }, (_, i) => i));
  assert.equal(sampleWords(entries, 100, 123).length, 50);
});

test('simulation and reports reflect both real wins and sixth-miss losses', () => {
  const knowledge = createKnowledge(parseLexicon('aaa 35\nbbb 35\nccc 35\nddd 35\neee 35\nfff 35\nggg 35\n', 3));
  const win = simulate('aaa', knowledge, 'count', () => 0);
  const loss = simulate('ggg', knowledge, 'count', () => 0);
  assert.equal(win.won, true);
  assert.equal(win.misses, 0);
  assert.equal(loss.won, false);
  assert.equal(loss.misses, 6);
  assert.equal(loss.turns, 6);
  assert.equal(loss.guesses, 'abcdef');
  assert.deepEqual(loss.candidateSizes, [7, 6, 5, 4, 3, 2]);
  assert.deepEqual(simulate('ggg', knowledge, 'count', () => 0), loss);
  const report = summarize([win, loss]);
  assert.equal(report.winRate, 0.5);
  assert.equal(report.averageMisses, 3);
  assert.equal(report.averageTurns, 3.5);
  assert.deepEqual(report.zeroCandidateEvents, { expectedLowTier: 0, masterBugs: 0 });
  assert.deepEqual(report.decisionMilliseconds, { p50: 0, p95: 0 });
  assert.throws(() => simulate('zzz', knowledge, 'count', () => 0), /Master invariant/);
});
