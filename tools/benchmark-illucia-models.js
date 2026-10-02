import { readFile, mkdir, writeFile, rename, open, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRound, applyGuess, getRoundStatus, getIncorrectGuesses } from '../client/src/lib/hangman-core.js';
import { toPublicState } from '../client/src/lib/illucia/public-state.js';
import { MAX_WORD_LENGTH, MIN_WORD_LENGTH, createKnowledge } from '../client/src/lib/illucia/lexicon.js';
import { chooseLetter } from '../client/src/lib/illucia/strategy.js';
import { loadLexicons, sampleWords, simulate } from './benchmark-illucia.js';
import { WORD_BANDS } from './benchmark-illucia-tiers.js';
import { MODELS, PROMPT_VERSION, SYSTEM_PROMPT, modelInput, parseModelLetter, neuronEstimate, createCloudflareTransport, BenchmarkStop } from './lib/illucia-model.js';
import { EXPLANATION_PROMPT, DICTIONARY_PROMPT, explainedInput, parseExplainedLetter } from './lib/illucia-dictionary-model.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const SEED = 20260929;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)] ?? null;
export const EXPERIMENT_MODES = ['direct', 'board-explained', 'dictionary-explained'];

export function developmentSample(entriesByLength) {
  const entries = entriesByLength[5];
  const doubt = entries.find(e => e.word === 'doubt');
  if (!doubt) throw new Error('DOUBT must be in the accepted vocabulary.');
  return [doubt, ...sampleWords(entries.filter(e => e.size === 35 && e.word !== 'doubt'), 9, 20260930)]
    .map(e => ({ ...e, length: 5, band: WORD_BANDS.find(b => e.size >= b.min && e.size <= b.max).name }));
}

// Round-robin strata make a small pilot cover every length and rarity band.
export function pilotSample(entriesByLength, count = 50, seed = SEED) {
  if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error('Sample size must be 1–500.');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid seed.');
  const buckets = [];
  for (let length = MIN_WORD_LENGTH; length <= MAX_WORD_LENGTH; length++) {
    for (const [i, band] of WORD_BANDS.entries()) {
      buckets.push(sampleWords((entriesByLength[length] ?? []).filter(e => e.size >= band.min && e.size <= band.max),
        count, seed + length * 3 + i).map(e => ({ ...e, length, band: band.name })));
    }
  }
  const order = sampleWords(buckets, buckets.length, seed);
  const sample = [];
  for (let row = 0; sample.length < count; row++) {
    let found = false;
    for (const bucket of order) {
      if (bucket[row] && sample.length < count) { sample.push(bucket[row]); found = true; }
    }
    if (!found) throw new Error('Insufficient vocabulary for sample.');
  }
  return sample;
}

export async function playModel(word, knowledge, model, request, clock = () => performance.now(), mode = 'direct') {
  if (!EXPERIMENT_MODES.includes(mode)) throw new Error('Unknown experiment mode.');
  let round = createRound(word);
  const attempts = [];
  const moves = [];
  let firstIntervention = null;
  let stopReason = null;
  while (getRoundStatus(round) === 'playing') {
    const state = toPublicState(round);
    let letter = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const start = clock();
      try {
        const input = mode === 'direct' ? modelInput(state, attempt === 1)
          : explainedInput(state, knowledge, attempt === 1, mode === 'dictionary-explained');
        const result = await request(model, input);
        const parsed = mode === 'direct' ? parseModelLetter(result.response, state) : parseExplainedLetter(result.response, state);
        attempts.push({ turn: round.guesses.length + 1, retry: attempt === 1,
          milliseconds: clock() - start, reason: parsed.reason,
          // Bounded evidence; never fed back into a model prompt.
          response: typeof result.response === 'string' ? result.response.slice(0, mode === 'direct' ? 80 : 1200) : null,
          ...(result.providerModel ? { providerModel: result.providerModel } : {}),
          ...(Number.isFinite(result.usage?.neurons) ? { providerReportedNeurons: result.usage.neurons } : {}),
          ...(mode === 'direct' ? {} : { explanation: parsed.explanation ?? null,
            candidateCount: mode === 'dictionary-explained' ? JSON.parse(input.messages[1].content.split('\n')[0]).candidates.length : null,
            inputSha256: hash(input) }),
          usage: result.usage ? { prompt_tokens: result.usage.prompt_tokens, completion_tokens: result.usage.completion_tokens } : null,
          estimatedNeurons: neuronEstimate(model, result.usage) });
        letter = parsed.letter;
        if (letter) break;
      } catch (error) {
        if (!(error instanceof BenchmarkStop)) throw error;
        stopReason = error.message;
        attempts.push({ turn: round.guesses.length + 1, retry: attempt === 1, milliseconds: clock() - start, reason: stopReason });
        break;
      }
    }
    if (stopReason) break;
    const assisted = letter === null;
    if (assisted) {
      firstIntervention ??= round.guesses.length + 1;
      letter = chooseLetter(state, knowledge);
    }
    const next = applyGuess(round, letter);
    if (next === round) throw new Error('No legal progress.');
    round = next;
    moves.push({ letter, assisted });
  }
  const status = stopReason ? 'incomplete' : getRoundStatus(round);
  return { word, status, won: status === 'solved', misses: getIncorrectGuesses(round).length,
    turns: round.guesses.length, guesses: round.guesses.join(''), firstIntervention, moves, attempts, stopReason,
    // Pure lane ends at its first intervention; later outcomes belong only to assisted play.
    modelOnlyStatus: firstIntervention !== null ? 'invalid-forfeit' : status };
}

export function summarizeModels(games) {
  const completed = games.filter(g => g.status !== 'incomplete');
  const attempts = games.flatMap(g => g.attempts);
  const measured = attempts.filter(a => a.estimatedNeurons != null);
  return {
    started: games.length, completed: completed.length, incomplete: games.length - completed.length,
    modelOnly: { wins: completed.filter(g => g.modelOnlyStatus === 'solved').length,
      winRate: mean(completed.map(g => Number(g.modelOnlyStatus === 'solved'))),
      invalidForfeits: games.filter(g => g.modelOnlyStatus === 'invalid-forfeit').length },
    withFallback: { wins: completed.filter(g => g.won).length, winRate: mean(completed.map(g => Number(g.won))),
      assistedGames: games.filter(g => g.firstIntervention !== null).length,
      fallbackMoves: games.flatMap(g => g.moves).filter(m => m.assisted).length },
    averageMissesCompleted: mean(completed.map(g => g.misses)), averageTurnsCompleted: mean(completed.map(g => g.turns)),
    requests: attempts.length, retries: attempts.filter(a => a.retry).length,
    invalidReplies: attempts.filter(a => a.reason === 'invalid').length,
    repeatedReplies: attempts.filter(a => a.reason === 'repeated').length,
    requestMilliseconds: { p50: percentile(attempts.map(a => a.milliseconds), .5), p95: percentile(attempts.map(a => a.milliseconds), .95) },
    estimatedNeuronsFromReportedTokens: measured.reduce((sum, a) => sum + a.estimatedNeurons, 0),
    requestsWithUsage: measured.length, requestsWithoutUsage: attempts.length - measured.length,
    estimatedNeuronsPerCompletedGame: completed.length && completed.length === games.length && measured.length === attempts.length
      ? measured.reduce((sum, a) => sum + a.estimatedNeurons, 0) / completed.length : null,
  };
}

export async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2) + '\n');
  await rename(`${path}.tmp`, path);
}

// Reserve before dispatch and persist across runs. Failed calls retain reservations.
export function budgetedRequest(transport, ledger, save, { maxRequests = 1800, maxNeurons = 6000, day = () => new Date().toISOString().slice(0, 10) } = {}) {
  return async (model, input) => {
    if (day() !== ledger.day) throw new BenchmarkStop('utc-day-changed');
    const reservation = neuronEstimate(model, {
      prompt_tokens: Buffer.byteLength(JSON.stringify(input.messages)) + 256, completion_tokens: input.max_tokens,
    });
    if (ledger.requests >= maxRequests || ledger.reservedNeurons + reservation > maxNeurons) throw new BenchmarkStop('local-budget');
    ledger.requests++;
    ledger.reservedNeurons += reservation;
    await save(ledger);
    const result = await transport(model, input);
    const estimate = neuronEstimate(model, result.usage);
    if (estimate !== null) {
      ledger.reservedNeurons += Math.max(estimate, 0) - reservation;
      await save(ledger);
      if (estimate > reservation) throw new BenchmarkStop('reservation-exceeded');
    }
    return result;
  };
}

export async function benchmarkModels({ count = 50, seed = SEED, models = [], request, checkpoint = async () => {}, mode = 'direct', sampleKind = 'pilot' } = {}) {
  if (!EXPERIMENT_MODES.includes(mode) || !['pilot', 'five-letter-development'].includes(sampleKind)) throw new Error('Unknown experiment configuration.');
  if (models.some(model => !Object.hasOwn(MODELS, model)) || new Set(models).size !== models.length) throw new Error('Invalid models.');
  const { entriesByLength, manifestSha256 } = await loadLexicons();
  const sample = sampleKind === 'pilot' ? pilotSample(entriesByLength, count, seed) : developmentSample(entriesByLength);
  count = sample.length;
  const prompt = mode === 'direct' ? SYSTEM_PROMPT : mode === 'dictionary-explained' ? DICTIONARY_PROMPT : EXPLANATION_PROMPT;
  const knowledge = Object.fromEntries(Object.entries(entriesByLength).map(([length, entries]) => [length, createKnowledge(entries)]));
  const baseline = sample.map(e => ({ ...simulate(e.word, knowledge[e.length], 'count'), ...e }));
  const report = {
    schemaVersion: 1, startedAt: new Date().toISOString(), status: models.length ? 'running' : 'baseline-only',
    configuration: { seed: sampleKind === 'pilot' ? seed : 20260930, count, models, mode, sampleKind, manifestSha256, sampleSha256: hash(sample),
      promptVersion: mode === 'direct' ? PROMPT_VERSION : 'i7a-dictionary-1', promptSha256: hash(prompt), systemPrompt: prompt,
      temperature: 0, maxTokens: mode === 'direct' ? 4 : 160, requestTimeoutMs: 10000, retries: 1, fallback: 'Master count; explicitly assisted',
      assistance: mode === 'dictionary-explained' ? 'complete public-board candidate list; may include or uniquely identify the answer' : 'public board only',
      resultMeaning: 'modelOnly means no fallback letter selection; dictionary mode still has dictionary assistance',
      sampling: sampleKind === 'pilot' ? 'seeded round-robin over shuffled length × rarity strata; pilot, not population-weighted'
        : 'DOUBT plus 9 seeded common five-letter words; development smoke test, not held-out evaluation',
      neuronRates: MODELS, pricingChecked: '2026-09-29' },
    environment: { node: process.version, platform: process.platform }, sample, baseline, results: {},
  };
  const refresh = () => {
    for (const result of Object.values(report.results)) {
      result.overall = summarizeModels(result.games);
      result.byLength = Object.fromEntries([...new Set(sample.map(e => e.length))].sort((a,b) => a-b).map(length =>
        [length, summarizeModels(result.games.filter(g => g.length === length))]));
      result.byBand = Object.fromEntries(WORD_BANDS.map(b => [b.name, summarizeModels(result.games.filter(g => g.band === b.name))]));
      const complete = new Set(result.games.filter(g => g.status !== 'incomplete').map(g => g.word));
      const matched = baseline.filter(g => complete.has(g.word));
      result.matchedBaseline = { games: matched.length, wins: matched.filter(g => g.won).length,
        winRate: mean(matched.map(g => Number(g.won))) };
    }
  };
  await checkpoint(report);
  // Interleave contestants by word, keeping comparable prefixes if a run stops.
  outer: for (const entry of sample) {
    for (const model of models) {
      const result = report.results[model] ??= { games: [] };
      const game = await playModel(entry.word, knowledge[entry.length], model, request, () => performance.now(), mode);
      result.games.push({ ...game, ...entry });
      refresh();
      if (game.stopReason) { report.status = 'stopped'; report.stopReason = game.stopReason; }
      await checkpoint(report);
      console.error(`${model}: ${result.games.length}/${count} games (${result.overall.modelOnly.wins} wins without fallback moves)`);
      if (game.stopReason) break outer;
    }
  }
  if (report.status === 'running') report.status = 'complete';
  report.finishedAt = new Date().toISOString();
  await checkpoint(report);
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const options = { models: [] };
  let live = false, wrangler = false, freePlan = false;
  let output = resolve(ROOT, 'tools/benchmarks/illucia-i7a-baseline.json');
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--live') live = true;
    else if (flag === '--wrangler-auth') wrangler = true;
    else if (flag === '--free-plan') freePlan = true;
    else if (['--count', '--seed', '--models', '--output', '--mode', '--sample'].includes(flag)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
      if (flag === '--count') options.count = Number(value);
      if (flag === '--seed') options.seed = Number(value);
      if (flag === '--models') options.models = value.split(',');
      if (flag === '--output') output = resolve(value);
      if (flag === '--mode') options.mode = value;
      if (flag === '--sample') options.sampleKind = value;
    } else throw new Error(`Unknown option ${flag}`);
  }
  if (!live && options.models.length) throw new Error('Use --live for model requests.');
  if ((options.mode && options.mode !== 'direct' || options.sampleKind) && !args.includes('--output')) throw new Error('Experiments require a separate explicit output path.');
  if (live && (!freePlan || !args.includes('--output'))) throw new Error('Live runs require --free-plan and an explicit --output. Use only a Workers Free account.');
  options.checkpoint = report => atomicJson(output, report);
  let session;
  try {
    if (live) {
      options.models = options.models.length ? options.models : Object.keys(MODELS);
      if (options.models.some(m => !Object.hasOwn(MODELS, m))) throw new Error('Model is not allowlisted.');
      session = await openLiveSession({ wrangler });
      options.request = session.request;
      options.checkpoint = report => atomicJson(output, { ...report, budget: session.budget() });
    }
    const report = await benchmarkModels(options);
    console.log(`Report: ${output} (${report.status})`);
    if (report.status === 'stopped') process.exitCode = 2;
  } finally {
    await session?.close();
  }
}

export const DAILY_MAX_REQUESTS = 1800;
export const DAILY_MAX_NEURONS = 6000;

// The live-run setup shared by I7a and D1: credentials held in memory only, the exclusive
// local lock, and the dated daily ledger with its budgeted request wrapper.
export async function openLiveSession({ wrangler = false, transportOptions = {} } = {}) {
  let token = process.env.CLOUDFLARE_API_TOKEN;
  if (wrangler) {
    try {
      const { stdout } = await promisify(execFile)(process.execPath,
        [resolve(ROOT, 'server/node_modules/wrangler/bin/wrangler.js'), 'auth', 'token', '--json'],
        { cwd: resolve(ROOT, 'server'), windowsHide: true, timeout: 30000, maxBuffer: 65536 });
      token = JSON.parse(stdout).token;
    } catch { throw new Error('Could not obtain Wrangler credentials. Run wrangler login separately.'); }
  }
  const transport = createCloudflareTransport({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, token, ...transportOptions });
  const lockPath = resolve(ROOT, 'tools/output/illucia-i7a.lock');
  await mkdir(dirname(lockPath), { recursive: true });
  const lock = await open(lockPath, 'wx');
  const close = async () => { await lock.close(); await unlink(lockPath); };
  try {
    const day = new Date().toISOString().slice(0, 10);
    const ledgerPath = resolve(ROOT, `tools/output/illucia-i7a-budget-${day}.json`);
    let ledger = { day, requests: 0, reservedNeurons: 0 };
    try { ledger = JSON.parse(await readFile(ledgerPath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (ledger.day !== day || !Number.isInteger(ledger.requests) || ledger.requests < 0 ||
        !Number.isFinite(ledger.reservedNeurons) || ledger.reservedNeurons < 0) throw new Error('Invalid budget ledger.');
    return {
      request: budgetedRequest(transport, ledger, value => atomicJson(ledgerPath, value),
        { maxRequests: DAILY_MAX_REQUESTS, maxNeurons: DAILY_MAX_NEURONS }),
      budget: () => ({ ...ledger, maxRequests: DAILY_MAX_REQUESTS, maxNeurons: DAILY_MAX_NEURONS,
        scope: 'local I7a runs today; excludes other account usage; token-derived estimates, not billed neurons' }),
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Benchmark failed. Check options, credentials, output access and the local budget lock. No credentials are logged.'); process.exitCode = 1; });
}
