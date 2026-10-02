import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleWords, simulate, summarize } from './benchmark-illucia.js';
import { createKnowledge } from '../client/src/lib/illucia/lexicon.js';
import { tierSamples } from './benchmark-illucia-tiers.js';

// Tiny 3-letter fixtures bypass the word-file parser, whose contract is lengths 4-15.
const entriesOf = text => text.trim().split('\n').map(line => {
  const [word, size] = line.split(' ');
  return Object.freeze({ word, size: Number(size) });
});

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
  const knowledge = createKnowledge(entriesOf('aaa 35\nbbb 35\nccc 35\nddd 35\neee 35\nfff 35\nggg 35\n'));
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
  const entries = entriesOf('act 70\ncat 35\nxyz 70\n');
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
  const entries = entriesOf('aaa 35\naab 35\naac 40\naad 50\naae 55\naaf 65\naag 70\n');
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

test('round seeds are shared by word and index, and differ across them (v2 A2)', async () => {
  const { roundSeed } = await import('./benchmark-illucia.js');
  assert.equal(roundSeed(1, 'cats', 0), roundSeed(1, 'cats', 0));
  const seeds = new Set();
  for (const word of ['cats', 'dogs', 'hand']) for (let index = 0; index < 8; index++) seeds.add(roundSeed(20260928, word, index));
  assert.equal(seeds.size, 24);
  assert.notEqual(roundSeed(1, 'cats', 0), roundSeed(2, 'cats', 0));
  assert.ok([...seeds].every(seed => Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff));
});

test('per-word win fractions and variety are counted per word and per opening', async () => {
  const { perWord, variety } = await import('./benchmark-illucia.js');
  const games = [
    { word: 'cats', won: true, guesses: 'eacts' }, { word: 'cats', won: false, guesses: 'aeiou' },
    { word: 'cats', won: true, guesses: 'eacts' }, { word: 'dogs', won: true, guesses: 'eodgs' },
  ];
  assert.deepEqual(perWord(games).map(entry => [entry.word, entry.won]), [['cats', 2 / 3], ['dogs', 1]]);
  const result = variety(games);
  assert.equal(result.distinctSequencesPerWord, 1.5); // cats: 2 sequences; dogs: 1.
  assert.equal(result.wordsWithMoreThanOneSequence, 0.5);
  assert.equal(result.openings.distinct, 2);
  assert.deepEqual(result.openings.shares, { e: 0.75, a: 0.25 });
  assert.equal(result.openings.entropyBits, Number((-(0.75 * Math.log2(0.75) + 0.25 * Math.log2(0.25))).toFixed(4)));
  // Positive control: one opening only means zero entropy.
  assert.equal(variety(games.slice(3)).openings.entropyBits, 0);
});
