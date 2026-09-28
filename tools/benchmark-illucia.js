import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRound, applyGuess, getRoundStatus, getIncorrectGuesses } from '../client/src/lib/hangman-core.js';
import { toPublicState } from '../client/src/lib/illucia/public-state.js';
import { parseLexicon, createKnowledge } from '../client/src/lib/illucia/lexicon.js';
import { analyzeDecision, POLICIES } from '../client/src/lib/illucia/strategy.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DEFAULT_SEED = 20260928;

export function sampleWords(entries, count, seed) {
  let value = seed >>> 0;
  const random = () => {
    value += 0x6D2B79F5;
    let x = value;
    x = Math.imul(x ^ x >>> 15, x | 1);
    x ^= x + Math.imul(x ^ x >>> 7, x | 61);
    return ((x ^ x >>> 14) >>> 0) / 4294967296;
  };
  const shuffled = [...entries];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

export function simulate(word, knowledge, policy, clock = () => performance.now()) {
  if (knowledge.maxSize === 70 && !knowledge.words.includes(word)) {
    throw new Error('Master invariant: answer is outside the vocabulary.');
  }
  let round = createRound(word);
  const milliseconds = [];
  const candidateSizes = [];
  while (getRoundStatus(round) === 'playing') {
    const state = toPublicState(round);
    const start = clock();
    const decision = analyzeDecision(state, knowledge, policy);
    milliseconds.push(clock() - start);
    candidateSizes.push(decision.candidateCount);
    const next = applyGuess(round, decision.letter);
    if (next === round || next.guesses.length > 26) throw new Error('Solver made no legal progress.');
    round = next;
  }
  return { word, won: getRoundStatus(round) === 'solved',
    misses: getIncorrectGuesses(round).length, turns: round.guesses.length,
    guesses: round.guesses.join(''), milliseconds, candidateSizes };
}

function quantile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}
const mean = values => values.reduce((a, b) => a + b, 0) / (values.length || 1);
const rounded = value => Number(value.toFixed(4));

export function summarize(games) {
  const times = games.flatMap(game => game.milliseconds);
  const sizes = games.flatMap(game => game.candidateSizes);
  return {
    games: games.length,
    wins: games.filter(game => game.won).length,
    winRate: rounded(mean(games.map(game => Number(game.won)))),
    averageMisses: rounded(mean(games.map(game => game.misses))),
    averageTurns: rounded(mean(games.map(game => game.turns))),
    decisionMilliseconds: { p50: rounded(quantile(times, 0.5)), p95: rounded(quantile(times, 0.95)) },
    candidateSizes: { mean: rounded(mean(sizes)), p50: quantile(sizes, 0.5), p95: quantile(sizes, 0.95), max: sizes.reduce((a, b) => Math.max(a, b), 0) },
    zeroCandidateEvents: { expectedLowTier: 0, masterBugs: sizes.filter(size => size === 0).length },
  };
}

export async function benchmark({ perLength = 250, seed = DEFAULT_SEED, policies = POLICIES } = {}) {
  if (!Number.isInteger(perLength) || perLength < 1) throw new Error('perLength must be a positive integer.');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('seed must be an unsigned 32-bit integer.');
  if (!policies.length || policies.some(policy => !POLICIES.includes(policy))) throw new Error('Unknown policies.');
  const dataRoot = resolve(ROOT, 'client/public/illucia/words');
  const manifestBytes = await readFile(resolve(dataRoot, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  const samples = {};
  const knowledgeByLength = {};
  for (let length = 3; length <= 15; length++) {
    const bytes = await readFile(resolve(dataRoot, `${length}.txt`));
    if (createHash('sha256').update(bytes).digest('hex') !== manifest.files[`${length}.txt`].sha256) {
      throw new Error(`Vocabulary checksum mismatch for length ${length}.`);
    }
    const entries = parseLexicon(bytes.toString('utf8'), length);
    samples[length] = sampleWords(entries, perLength, seed + length);
    knowledgeByLength[length] = createKnowledge(entries);
  }
  const report = {
    configuration: { seed, perLength, maxSize: 70, policies,
      baseline: 'count', riskExponent: 2, lookahead: { depth: 2, maxCandidates: 12, maxMissesLeft: 2 },
      manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
      sampleSha256: createHash('sha256').update(JSON.stringify(samples)).digest('hex') },
    environment: { node: process.version, platform: process.platform, architecture: process.arch },
    results: {},
  };
  for (const policy of policies) {
    const games = [];
    const byLength = {};
    for (let length = 3; length <= 15; length++) {
      const batch = samples[length].map(entry => ({ ...simulate(entry.word, knowledgeByLength[length], policy), size: entry.size }));
      games.push(...batch);
      byLength[length] = summarize(batch);
    }
    const byDistinctLetters = {};
    for (let count = 1; count <= 15; count++) {
      const group = games.filter(game => new Set(game.word).size === count);
      if (group.length) byDistinctLetters[count] = summarize(group);
    }
    const byVocabularySize = {};
    for (const [name, lo, hi] of [['common', 35, 35], ['medium', 40, 50], ['rare', 55, 70]]) {
      byVocabularySize[name] = summarize(games.filter(game => game.size >= lo && game.size <= hi));
    }
    report.results[policy] = { overall: summarize(games), byLength, byDistinctLetters, byVocabularySize,
      hardestWords: [...games].sort((a, b) => Number(a.won) - Number(b.won) || b.misses - a.misses || b.turns - a.turns ||
        (a.word < b.word ? -1 : a.word > b.word ? 1 : 0)).slice(0, 20)
        .map(({ milliseconds, candidateSizes, ...game }) => game) };
    console.error(`${policy}: ${report.results[policy].overall.wins}/${games.length} solved`);
  }
  return report;
}

async function main() {
  const options = { output: resolve(ROOT, 'tools/benchmarks/illucia-i3.json') };
  for (let i = 2; i < process.argv.length; i += 2) {
    const [flag, value] = process.argv.slice(i, i + 2);
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    if (flag === '--per-length') options.perLength = Number(value);
    else if (flag === '--seed') options.seed = Number(value);
    else if (flag === '--policies') options.policies = value.split(',');
    else if (flag === '--output') options.output = resolve(value);
    else throw new Error(`Unknown option ${flag}`);
  }
  const report = await benchmark(options);
  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Report: ${options.output}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
