import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleWords, simulate, summarize } from './benchmark-illucia.js';
import { createKnowledge, parseLexicon } from '../client/src/lib/illucia/lexicon.js';
import { tierSamples } from './benchmark-illucia-tiers.js';

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

test('tier simulation counts fallback decisions separately from affected games', () => {
  const entries = parseLexicon('act 70\ncat 35\nxyz 70\n', 3);
  const low = createKnowledge(entries, 35);
  const win = simulate('act', low, 'count', () => 0);
  const loss = simulate('xyz', low, 'count', () => 0);
  const known = simulate('cat', low, 'count', () => 0);
  assert.equal(win.won, true);
  assert.equal(win.guesses, 'act');
  assert.deepEqual(win.candidateSizes, [1, 0, 0]);
  assert.equal(loss.won, false);
  assert.equal(loss.misses, 6);
  assert.equal(new Set(loss.guesses).size, loss.turns);
  assert.equal(known.inVocabulary, true);
  assert.equal(known.candidateSizes.includes(0), false);
  const report = summarize([win, loss, known]);
  assert.equal(report.outOfVocabularyGames, 2);
  assert.equal(report.gamesUsingFallback, 2);
  assert.deepEqual(report.zeroCandidateEvents, { expectedLowTier: 7, masterBugs: 0 });
  const master = simulate('act', createKnowledge(entries), 'count', () => 0);
  assert.equal(master.candidateSizes.includes(0), false);
});

test('tier samples stratify by original size and cap small strata without duplication', () => {
  const entries = parseLexicon('aaa 35\naab 35\naac 40\naad 50\naae 55\naaf 65\naag 70\n', 3);
  const all = tierSamples({ 3: entries }, 100, 9);
  assert.deepEqual(all, tierSamples({ 3: entries }, 100, 9));
  assert.deepEqual(all[3].common.map(entry => entry.size), [35, 35]);
  assert.deepEqual(all[3].medium.map(entry => entry.size).sort(), [40, 50]);
  assert.deepEqual(all[3].rare.map(entry => entry.size).sort(), [55, 65, 70]);
  assert.equal(new Set(Object.values(all[3]).flat().map(entry => entry.word)).size, 7);
  assert.equal(tierSamples({ 3: entries }, 1, 9)[3].rare.length, 1);
  assert.deepEqual(tierSamples({ 3: entries.slice(0, 2) }, 1, 9)[3].rare, []);
  assert.throws(() => tierSamples({ 3: entries }, 0, 9), /positive/);
  assert.throws(() => tierSamples({ 3: entries }, 1, -1), /seed/);
});
