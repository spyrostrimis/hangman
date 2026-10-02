import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_WORD_LENGTH, MIN_WORD_LENGTH, VOCABULARY_TIERS, createKnowledge } from '../client/src/lib/illucia/lexicon.js';
import { DEFAULT_SEED, loadLexicons, roundSeed, sampleWords, simulate, summarize, variety } from './benchmark-illucia.js';

export const WORD_BANDS = Object.freeze([
  Object.freeze({ name: 'common', min: 35, max: 35 }),
  Object.freeze({ name: 'medium', min: 40, max: 50 }),
  Object.freeze({ name: 'rare', min: 55, max: 70 }),
]);

export function tierSamples(entriesByLength, perStratum, seed) {
  if (!Number.isInteger(perStratum) || perStratum < 1) throw new Error('perStratum must be positive.');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid seed.');
  return Object.fromEntries(Object.entries(entriesByLength).map(([length, entries]) => [length,
    Object.fromEntries(WORD_BANDS.map((band, index) => [band.name,
      sampleWords(entries.filter(entry => entry.size >= band.min && entry.size <= band.max),
        perStratum, seed + Number(length) * 3 + index)]))]));
}

// v2 A2: her temperament, every word played with `seeds` seeds shared by the three tiers.
export async function benchmarkTiers({ perStratum = 100, seed = DEFAULT_SEED, seeds = 8 } = {}) {
  const { entriesByLength, manifestSha256 } = await loadLexicons();
  const samples = tierSamples(entriesByLength, perStratum, seed);
  const report = {
    configuration: { seed, perStratum, policy: 'temperament', seedsPerWord: seeds, maxSizes: [35, 50, 70],
      temperaments: Object.fromEntries(VOCABULARY_TIERS.map(tier => [tier.id, tier.temperament])),
      fallback: 'own-tier per-length word-presence frequency; ties settled by the seed',
      wordBands: WORD_BANDS, manifestSha256,
      sampleSha256: createHash('sha256').update(JSON.stringify(samples)).digest('hex') },
    environment: { node: process.version, platform: process.platform, architecture: process.arch },
    sampleCounts: Object.fromEntries(Object.entries(samples).map(([length, bands]) =>
      [length, Object.fromEntries(Object.entries(bands).map(([name, entries]) => [name, entries.length]))])),
    results: {},
  };
  for (const maxSize of report.configuration.maxSizes) {
    const games = [];
    const byLength = {};
    const vocabularyCounts = {};
    for (let length = MIN_WORD_LENGTH; length <= MAX_WORD_LENGTH; length++) {
      const knowledge = createKnowledge(entriesByLength[length], maxSize);
      vocabularyCounts[length] = knowledge.words.length;
      const batch = [];
      const bands = {};
      for (const band of WORD_BANDS) {
        const group = samples[length][band.name].flatMap(entry => Array.from({ length: seeds }, (_, index) => ({
          ...simulate(entry.word, knowledge, { seed: roundSeed(seed, entry.word, index) }),
          size: entry.size, band: band.name, length,
        })));
        batch.push(...group);
        bands[band.name] = summarize(group);
      }
      games.push(...batch);
      byLength[length] = { overall: summarize(batch), byWordBand: bands };
    }
    const byWordBand = {};
    const comparisonLengths5to9 = {};
    for (const band of WORD_BANDS) {
      byWordBand[band.name] = summarize(games.filter(game => game.band === band.name));
      comparisonLengths5to9[band.name] = summarize(games.filter(game =>
        game.band === band.name && game.length >= 5 && game.length <= 9));
    }
    report.results[maxSize] = { vocabularyCounts, overall: summarize(games), variety: variety(games), byWordBand,
      byLength, comparisonLengths5to9 };
    console.error(`Size ${maxSize}: ${report.results[maxSize].overall.wins}/${games.length} solved; ` +
      `${report.results[maxSize].overall.gamesUsingFallback} games used fallback`);
  }
  return report;
}

async function main() {
  const options = {};
  let output = fileURLToPath(new URL('benchmarks/illucia-i3b.json', import.meta.url));
  for (let i = 2; i < process.argv.length; i += 2) {
    const [flag, value] = process.argv.slice(i, i + 2);
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    if (flag === '--per-stratum') options.perStratum = Number(value);
    else if (flag === '--seed') options.seed = Number(value);
    else if (flag === '--seeds') options.seeds = Number(value);
    else if (flag === '--output') output = resolve(value);
    else throw new Error(`Unknown option ${flag}`);
  }
  const report = await benchmarkTiers(options);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Report: ${output}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
