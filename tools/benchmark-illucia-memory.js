import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALPHABET, VOCABULARY_TIERS } from '../client/src/lib/illucia/lexicon.js';
import { DEFAULT_SEED, loadLexicons, roundSeed, sampleWords } from './benchmark-illucia.js';
import { SEEDS_PER_WORD, gateCells, playSets, strengthCap, wordSets } from './benchmark-illucia-strength.js';
import { WORD_BANDS } from './benchmark-illucia-tiers.js';
import { compareVariants } from './benchmark-illucia-information.js';
import { tierGate } from './lib/illucia-gate.js';

// v2 A3 experiment: does her memory of a player (personality and letter habits) keep the tier
// order and the strength cap, and what does it do to variety? Game `index` of every word is
// played by synthetic player `index`, whose history spans the prior's whole ramp.
export const PLAYER_GAMES = Object.freeze([0, 5, 10, 20, 35, 50, 100, 200]);

// A player's memory as C2 would send it: letters counts the history words containing each letter.
export function syntheticPlayers(entriesByLength, seed = DEFAULT_SEED, games = PLAYER_GAMES) {
  const pool = [];
  for (let length = 4; length <= 8; length++) pool.push(...entriesByLength[length].filter(entry => entry.size <= 35));
  return games.map((count, index) => {
    const history = sampleWords(pool, count, roundSeed(seed, 'history', index)).map(entry => entry.word);
    const letters = Object.fromEntries([...ALPHABET].map(letter => [letter, history.filter(word => word.includes(letter)).length]));
    return Object.freeze({ personalitySeed: roundSeed(seed, 'personality', index), games: count, letters, learned: [] });
  });
}

export async function memoryExperiment({ seed = DEFAULT_SEED, seeds = SEEDS_PER_WORD } = {}) {
  if (seeds !== PLAYER_GAMES.length) throw new Error(`One synthetic player per seed: use ${PLAYER_GAMES.length} seeds.`);
  const { entriesByLength, manifestSha256 } = await loadLexicons();
  const { sets } = await wordSets(entriesByLength, seed);
  const players = syntheticPlayers(entriesByLength, seed);
  const plain = playSets(entriesByLength, sets, { seeds, baseSeed: seed, strictReference: false });
  console.error('No memory played.');
  const remembered = playSets(entriesByLength, sets, { seeds, baseSeed: seed, brains: index => players[index] });
  console.error('With memory played.');
  const sizeOf = word => entriesByLength[word.length].find(entry => entry.word === word).size;
  const bandOf = word => WORD_BANDS.find(band => sizeOf(word) >= band.min && sizeOf(word) <= band.max).name;
  const summaryOf = run => Object.fromEntries(VOCABULARY_TIERS.map(tier => [tier.id, Object.fromEntries(
    Object.keys(sets).map(key => [key, { winRate: run.results[tier.id][key].winRate, variety: run.results[tier.id][key].variety }]))]));
  const comparison = compareVariants(plain.words, remembered.words);
  const gate = tierGate(gateCells(remembered.words, bandOf));
  const cap = strengthCap(remembered.results, remembered.reference);
  for (const row of comparison.rows) {
    console.error(`${row.tier} ${row.set}: no memory ${(row.plainWinRate * 100).toFixed(1)}% memory ${(row.informedWinRate * 100).toFixed(1)}% ` +
      `(Holm p ${row.holmP}${row.costsStrength ? ', COSTS STRENGTH' : ''})`);
  }
  console.error(`Tier gate with memory: ${gate.passed ? 'PASS' : 'FAIL'} (${gate.failures.length} fail, ${gate.nearMisses.length} near misses). ` +
    `Strength cap with memory: ${cap.passed ? 'PASS' : 'FAIL'}. No strength lost beyond noise: ${comparison.noStrengthLost}.`);
  return {
    configuration: { seed, seedsPerWord: seeds, manifestSha256,
      players: players.map(({ personalitySeed, games }) => ({ personalitySeed, games })),
      history: 'size-35 words of 4-8 letters, seeded per player; learned words empty',
      note: 'Game `index` of every word is played by synthetic player `index`.' },
    environment: { node: process.version, platform: process.platform, architecture: process.arch },
    noMemory: summaryOf(plain), memory: summaryOf(remembered),
    comparison: { ...comparison, note: 'plain = no memory; informed = with memory' },
    gateWithMemory: { passed: gate.passed, failures: gate.failures, nearMisses: gate.nearMisses, lowerTierAhead: gate.lowerTierAhead },
    capWithMemory: cap,
  };
}

async function main() {
  let output = fileURLToPath(new URL('benchmarks/illucia-a3-memory.json', import.meta.url));
  for (let i = 2; i < process.argv.length; i += 2) {
    const [flag, value] = process.argv.slice(i, i + 2);
    if (flag === '--output' && value) output = resolve(value);
    else throw new Error(`Unknown option ${flag}`);
  }
  const report = await memoryExperiment();
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Report: ${output}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
