import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadLexicons, simulate } from './benchmark-illucia.js';
import { COMMON_PER_LENGTH, TRICKSTER_WORDS, compareParity, feel, gateCells, wordSets } from './benchmark-illucia-strength.js';
import { MIN_WORD_LENGTH, createKnowledge } from '../client/src/lib/illucia/lexicon.js';

// Tiny 3-letter fixtures bypass the word-file parser, whose contract is lengths 4-15.
const entriesOf = text => text.trim().split('\n').map(line => {
  const [word, size] = line.split(' ');
  return Object.freeze({ word, size: Number(size) });
});

test('word sets are fixed, accepted, and reuse the committed I3b sample', async () => {
  const { entriesByLength } = await loadLexicons();
  const first = await wordSets(entriesByLength);
  assert.deepEqual(await wordSets(entriesByLength), first);
  const committed = JSON.parse(await readFile(new URL('benchmarks/illucia-i3b.json', import.meta.url), 'utf8'));
  assert.equal(first.sampleSha256I3b, committed.configuration.sampleSha256);
  assert.equal(first.sets.d.words.length, 3600);
  assert.equal(new Set(TRICKSTER_WORDS).size, TRICKSTER_WORDS.length);
  assert.ok(TRICKSTER_WORDS.length >= 30 && TRICKSTER_WORDS.every(word => word.length >= MIN_WORD_LENGTH && word.length <= 6));
  for (let length = MIN_WORD_LENGTH; length <= 6; length++) {
    const common = first.sets.b.words.filter(word => word.length === length);
    const pool = entriesByLength[length].filter(entry => entry.size <= 35).map(entry => entry.word);
    assert.equal(common.length, Math.min(COMMON_PER_LENGTH, pool.length));
    assert.ok(common.every(word => pool.includes(word)));
  }
  assert.ok(first.sets.b.words.every(word => word.length >= MIN_WORD_LENGTH && word.length <= 6));
  // Every manifest word is in the accepted list today; the set would shrink if one were not.
  assert.deepEqual(first.manifestRejected, []);
  assert.equal(first.sets.a.words.length, 105);
});

test('parity comparison reports a divergent page sequence and passes an identical one', () => {
  const cases = [
    { word: 'cat', tier: 'apprentice', expected: 'aect', expectedOutcome: 'solved', inTier: true, fallback: false },
    { word: 'cat', tier: 'master', expected: 'eact', expectedOutcome: 'solved', inTier: true, fallback: false },
  ];
  const same = cases.flatMap(value => ['illucia', 'illucia-observatory'].map(page =>
    ({ page, word: value.word, tier: value.tier, guesses: value.expected, outcome: value.expectedOutcome })));
  const clean = compareParity(cases, same);
  assert.equal(clean.illucia.matches, 2);
  assert.deepEqual(clean.illucia.mismatches, []);
  assert.equal(clean.illucia.control.differing, 1);
  const diverged = same.map(row => row.page === 'illucia-observatory' && row.tier === 'master' ? { ...row, guesses: 'aect' } : row);
  const report = compareParity(cases, diverged);
  assert.equal(report.illucia.mismatches.length, 0);
  assert.equal(report['illucia-observatory'].mismatches.length, 1);
  assert.equal(report['illucia-observatory'].mismatches[0].expected, 'eact');
});

test('round feel separates wins by misses, last-chance wins and losses', () => {
  const knowledge = createKnowledge(entriesOf('aaa 35\nbbb 35\nccc 35\nddd 35\neee 35\nfff 35\nggg 35\n'));
  const games = ['aaa', 'fff', 'ggg'].map(word => simulate(word, knowledge, 'count', () => 0));
  const result = feel(games);
  assert.deepEqual(result.missesAtWin, { 0: 1, 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 });
  assert.equal(result.wonOnLastChance, 1);
  assert.equal(result.lost, 1);
  assert.equal(result.decidedOnLastMissShare, 0.6667);
  assert.equal(result.fallbackShare, 0);
});

test('gate cells cover set a, sets b and c by length 4-6, and set d by length and band', () => {
  const words = { a: ['abcd', 'abcdefg'], b: ['abcd', 'abcde', 'abcdef'], c: ['wxyz', 'wxyzv', 'wxyzvu'],
    d: ['dddd', 'eeee', 'ffff', 'ddddddddddddddd'] };
  const band = { dddd: 'common', eeee: 'medium', ffff: 'rare', ddddddddddddddd: 'rare' };
  const games = Object.fromEntries(['apprentice', 'scholar', 'master'].map(tier => [tier,
    Object.fromEntries(Object.entries(words).map(([key, list]) => [key, list.map(word => ({ word, won: true }))]))]));
  const cells = gateCells(games, word => band[word]);
  assert.equal(cells.length, 1 + 2 * 4 + 12 * 4);
  const slice = (set, name) => cells.find(cell => cell.set === set && cell.slice === name).games.master.map(game => game.word);
  assert.deepEqual(slice('a', 'all'), words.a);
  assert.deepEqual(slice('b', 'length 5'), ['abcde']);
  assert.deepEqual(slice('c', 'all'), words.c);
  assert.deepEqual(slice('d', 'length 4'), ['dddd', 'eeee', 'ffff']);
  assert.deepEqual(slice('d', 'length 4 medium'), ['eeee']);
  assert.deepEqual(slice('d', 'length 15 rare'), ['ddddddddddddddd']);
  assert.deepEqual(slice('d', 'length 15 common'), []);
  assert.equal(cells.some(cell => cell.slice.includes('length 3')), false);
  // Every tier gets the same words in the same order, as the paired test requires.
  for (const cell of cells) {
    assert.deepEqual(cell.games.apprentice.map(game => game.word), cell.games.master.map(game => game.word));
  }
});

test('the strength cap flags a tier that loses more than 2 points on set b or d', async () => {
  const { strengthCap } = await import('./benchmark-illucia-strength.js');
  const rates = (b, d) => ({ b: { winRate: b }, d: { winRate: d } });
  const reference = { apprentice: rates(0.73, 0.41), scholar: rates(0.72, 0.65), master: rates(0.725, 0.90) };
  const within = { apprentice: rates(0.72, 0.40), scholar: rates(0.70, 0.64), master: rates(0.71, 0.89) };
  assert.equal(strengthCap(within, reference).passed, true);
  const over = { ...within, master: rates(0.70, 0.89) }; // 2.5 points lost on b.
  const result = strengthCap(over, reference);
  assert.equal(result.passed, false);
  assert.deepEqual(result.rows.filter(row => !row.ok).map(row => `${row.tier} ${row.set}`), ['master b']);
});
