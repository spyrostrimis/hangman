import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VOCABULARY_TIERS } from '../client/src/lib/illucia/lexicon.js';
import { DEFAULT_SEED, loadLexicons } from './benchmark-illucia.js';
import { SEEDS_PER_WORD, gateCells, playSets, wordSets } from './benchmark-illucia-strength.js';
import { WORD_BANDS } from './benchmark-illucia-tiers.js';
import { GATE_ALPHA, holmAdjust, pairedComparison, tierGate } from './lib/illucia-gate.js';

// v2 A2 experiment (decisions 1.5): does weighting her shortlist by information value
// ("this letter splits the candidates better") cost strength beyond noise? Benchmark-only:
// no tier ships with it. Both variants play the same words with the same seeds.
export const INFORMATION = 100; // Odds rise by up to 100% for the best-splitting letter.

// One-sided: is the plain temperament ahead of the information variant, word by word?
export function compareVariants(plain, informed, alpha = GATE_ALPHA) {
  const rows = [];
  for (const tier of VOCABULARY_TIERS) {
    for (const key of Object.keys(plain[tier.id])) {
      const result = pairedComparison(plain[tier.id][key], informed[tier.id][key]);
      rows.push({ tier: tier.id, set: key, words: result.words,
        plainWinRate: result.lowerWinRate, informedWinRate: result.higherWinRate,
        difference: result.difference, plainAhead: result.lowerOnly, informedAhead: result.higherOnly, p: result.p });
    }
  }
  const adjusted = holmAdjust(rows.map(row => row.p));
  const round = value => Number(value.toFixed(6));
  const out = rows.map((row, index) => ({ ...row, plainWinRate: round(row.plainWinRate),
    informedWinRate: round(row.informedWinRate), difference: round(row.difference), p: round(row.p),
    holmP: round(adjusted[index]), costsStrength: adjusted[index] <= alpha }));
  return { test: 'one-sided exact sign test (plain ahead of informed), Holm-corrected', alpha,
    noStrengthLost: out.every(row => !row.costsStrength), rows: out };
}

export async function informationExperiment({ seed = DEFAULT_SEED, seeds = SEEDS_PER_WORD, information = INFORMATION } = {}) {
  const { entriesByLength, manifestSha256 } = await loadLexicons();
  const { sets } = await wordSets(entriesByLength, seed);
  const informedTemperaments = Object.fromEntries(VOCABULARY_TIERS.map(tier =>
    [tier.id, { ...tier.temperament, information }]));
  const plain = playSets(entriesByLength, sets, { seeds, baseSeed: seed, strictReference: false });
  console.error('Plain temperament played.');
  const informed = playSets(entriesByLength, sets, { seeds, baseSeed: seed, temperaments: informedTemperaments, strictReference: false });
  console.error('Information variant played.');
  const sizeOf = word => entriesByLength[word.length].find(entry => entry.word === word).size;
  const bandOf = word => WORD_BANDS.find(band => sizeOf(word) >= band.min && sizeOf(word) <= band.max).name;
  const summaryOf = run => Object.fromEntries(VOCABULARY_TIERS.map(tier => [tier.id, Object.fromEntries(
    Object.keys(sets).map(key => [key, { winRate: run.results[tier.id][key].winRate, variety: run.results[tier.id][key].variety }]))]));
  const comparison = compareVariants(plain.words, informed.words);
  const gate = tierGate(gateCells(informed.words, bandOf));
  for (const row of comparison.rows) {
    console.error(`${row.tier} ${row.set}: plain ${(row.plainWinRate * 100).toFixed(1)}% informed ${(row.informedWinRate * 100).toFixed(1)}% ` +
      `(Holm p ${row.holmP}${row.costsStrength ? ', COSTS STRENGTH' : ''})`);
  }
  console.error(`No strength lost beyond noise: ${comparison.noStrengthLost}. Tier gate with information: ${gate.passed ? 'PASS' : 'FAIL'}.`);
  return {
    configuration: { seed, seedsPerWord: seeds, information, manifestSha256,
      plainTemperaments: Object.fromEntries(VOCABULARY_TIERS.map(tier => [tier.id, tier.temperament])),
      note: 'Benchmark-only experiment (decisions 1.5); no tier ships with information value.' },
    environment: { node: process.version, platform: process.platform, architecture: process.arch },
    plain: summaryOf(plain), informed: summaryOf(informed), comparison,
    gateWithInformation: { passed: gate.passed, failures: gate.failures, nearMisses: gate.nearMisses },
  };
}

async function main() {
  const options = {};
  let output = fileURLToPath(new URL('benchmarks/illucia-a2-information.json', import.meta.url));
  for (let i = 2; i < process.argv.length; i += 2) {
    const [flag, value] = process.argv.slice(i, i + 2);
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    if (flag === '--seeds') options.seeds = Number(value);
    else if (flag === '--information') options.information = Number(value);
    else if (flag === '--output') output = resolve(value);
    else throw new Error(`Unknown option ${flag}`);
  }
  const report = await informationExperiment(options);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Report: ${output}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
