// Track D1: offline test of Workers AI models for Illucia's experimental mode. A model gets her
// candidates (≤80) and must invent a yes/no meaning question and sort every candidate (invent),
// or sort them under a WordNet category question chosen by code (sort, the control).
// Local research only: no UI and no Worker route. Live runs reuse the I7a session (credentials
// in memory, lock, daily ledger). See tools/ILLUCIA-AI-QUESTIONS.md.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRound, applyGuess, getRoundStatus } from '../client/src/lib/hangman-core.js';
import { toPublicState } from '../client/src/lib/illucia/public-state.js';
import { VOCABULARY_TIERS, createKnowledge } from '../client/src/lib/illucia/lexicon.js';
import { analyzeDecision } from '../client/src/lib/illucia/strategy.js';
import { filterCandidates } from '../client/src/lib/illucia/candidates.js';
import { DEFAULT_SEED, loadLexicons } from './benchmark-illucia.js';
import { WORD_BANDS, tierSamples } from './benchmark-illucia-tiers.js';
import { atomicJson, openLiveSession } from './benchmark-illucia-models.js';
import { QUESTION_MODELS, neuronEstimate, BenchmarkStop } from './lib/illucia-model.js';
import {
  QUESTION_PROMPT_VERSION, INVENT_PROMPT, SORT_PROMPT, MIN_YES_SHARE, MAX_YES_SHARE, SEED,
  questionInput, validateReply, scoreSort, answerPlacement, controlCategory, normalizeQuestionResult,
} from './lib/illucia-question-model.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = value => sha256(JSON.stringify(value));
const round2 = value => (value === null ? null : Math.round(value * 10000) / 10000);
const mean = values => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)] ?? null;

export const STATE_LENGTHS = Object.freeze([4, 5, 6, 7, 8, 9, 10]);
export const MIN_CANDIDATES = 8;
export const MAX_CANDIDATES = 80;
export const MAX_TOKENS = 4096;
export const TIMEOUT_MS = 30000;
export const TIMEOUTS_BEFORE_SKIP = 3;
// Each model's own request settings: the cheapest documented reasoning effort where one exists.
export const MODEL_OPTIONS = Object.freeze({ '@cf/openai/gpt-oss-20b': Object.freeze({ reasoning_effort: 'low' }) });
// Which word bands each tier's states rotate through (a tier only knows words up to its size).
const TIER_BANDS = { apprentice: ['common'], scholar: ['common', 'medium'], master: ['common', 'medium', 'rare'] };

// The words of the tier benchmark's sample, played by her committed temperament; each state is
// the first board with 8–80 candidates in that tier's vocabulary. Distinct words throughout.
export function buildStates(entriesByLength, labelsByLength, categories, { seed = DEFAULT_SEED, stateSeed = SEED } = {}) {
  const samples = tierSamples(entriesByLength, 100, seed);
  const used = new Set();
  const states = [];
  for (const [lengthIndex, length] of STATE_LENGTHS.entries()) {
    for (const tier of VOCABULARY_TIERS) {
      const knowledge = createKnowledge(entriesByLength[length], tier.maxSize);
      const bands = TIER_BANDS[tier.id];
      const band = bands[lengthIndex % bands.length];
      const roundSeed = stateSeed + states.length;
      let state = null;
      for (const entry of samples[length][band]) {
        if (used.has(entry.word)) continue;
        let round = createRound(entry.word);
        while (getRoundStatus(round) === 'playing') {
          const board = toPublicState(round);
          const candidates = filterCandidates(board, knowledge.words);
          if (candidates.length <= MAX_CANDIDATES) {
            if (candidates.length >= MIN_CANDIDATES) state = { entry, board, candidates };
            break;
          }
          round = applyGuess(round, analyzeDecision(board, knowledge, { seed: roundSeed }).letter);
        }
        if (state) break;
      }
      if (!state) throw new Error(`No ${tier.id} state for length ${length}.`);
      used.add(state.entry.word);
      const labels = labelsByLength[length];
      const candidateLabels = Object.fromEntries(state.candidates.map(word => [word, labels.get(word) ?? null]));
      states.push({
        id: `${length}-${tier.id}`, length, tier: tier.id, maxSize: tier.maxSize, band,
        answer: state.entry.word, answerSize: state.entry.size, roundSeed,
        pattern: state.board.pattern.map(letter => letter ?? '_').join(''),
        guessedLetters: state.board.guessedLetters.join(''), missedLetters: state.board.missedLetters.join(''),
        candidates: state.candidates, labels: candidateLabels,
        labelledCandidates: state.candidates.filter(word => candidateLabels[word] !== null).length,
        control: controlCategory(state.candidates, labels, categories),
      });
    }
  }
  return states;
}

async function loadLabels() {
  const dir = resolve(ROOT, 'client/public/illucia/labels');
  const manifest = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8'));
  const labelsByLength = {};
  for (const length of STATE_LENGTHS) {
    const bytes = await readFile(resolve(dir, `${length}.txt`));
    if (sha256(bytes) !== manifest.files[`${length}.txt`].sha256) throw new Error(`Label checksum mismatch for length ${length}.`);
    labelsByLength[length] = new Map(bytes.toString('utf8').trim().split('\n').map(line => line.split(' ')));
  }
  const categoriesBytes = await readFile(resolve(dir, 'categories.json'));
  return { labelsByLength, categories: JSON.parse(categoriesBytes).categories,
    manifestSha256: sha256(await readFile(resolve(dir, 'manifest.json'))), categoriesSha256: sha256(categoriesBytes) };
}

// LDNOOBW at its pinned hash (from the vocabulary build's cache) plus the project block list.
export async function loadBlocked() {
  const sources = JSON.parse(await readFile(resolve(ROOT, 'tools/illucia-sources.json'), 'utf8'));
  const bytes = await readFile(resolve(ROOT, `tools/cache/illucia/blocklist-${sources.blocklist.sha256}`));
  if (sha256(bytes) !== sources.blocklist.sha256) throw new Error('Blocklist checksum mismatch.');
  const filter = JSON.parse(await readFile(resolve(ROOT, 'tools/illucia-filter.json'), 'utf8'));
  const normalize = term => term.toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  return [...new Set([...bytes.toString('utf8').split('\n'), ...Object.keys(filter.block)].map(normalize).filter(Boolean))];
}

export async function writeStates(path) {
  const { entriesByLength, manifestSha256 } = await loadLexicons();
  const labels = await loadLabels();
  const states = buildStates(entriesByLength, labels.labelsByLength, labels.categories);
  const file = {
    schemaVersion: 1,
    configuration: { tierSampleSeed: DEFAULT_SEED, perStratum: 100, stateSeed: SEED, lengths: STATE_LENGTHS,
      tiers: VOCABULARY_TIERS.map(tier => tier.id), tierBands: TIER_BANDS, wordBands: WORD_BANDS,
      candidates: [MIN_CANDIDATES, MAX_CANDIDATES], player: 'her committed v2 temperament (analyzeDecision with a round seed)',
      rule: 'first board whose tier-vocabulary candidates number 8–80; distinct words; control = noun category closest to an even labelled split',
      wordsManifestSha256: manifestSha256, labelsManifestSha256: labels.manifestSha256, categoriesSha256: labels.categoriesSha256 },
    statesSha256: hash(states), states,
  };
  await atomicJson(path, file);
  return file;
}

// One request; a timeout is that model failing that state, every other stop ends the run.
async function ask({ request, model, mode, state, blocked, clock }) {
  const input = questionInput(mode, state.candidates, { question: mode === 'sort' ? state.control.question : null,
    maxTokens: MAX_TOKENS, options: MODEL_OPTIONS[model] ?? {} });
  const start = clock();
  let result;
  try {
    result = await request(model, input);
  } catch (error) {
    if (error instanceof BenchmarkStop && error.message === 'timeout') {
      return { state: state.id, model, mode, milliseconds: clock() - start, outcome: 'timeout', inputSha256: hash(input) };
    }
    throw error;
  }
  const verdict = validateReply(result.response, state.candidates, { mode, blocked });
  return {
    state: state.id, model, mode, milliseconds: clock() - start, inputSha256: hash(input), ...verdict,
    envelope: result.envelope, finishReason: result.finishReason, providerModel: result.providerModel,
    usage: result.usage, estimatedNeurons: neuronEstimate(model, result.usage),
    providerReportedNeurons: result.usage?.neurons ?? null,
    reasoningChars: result.reasoningChars, visibleChars: result.response.length,
    // Bounded evidence; never fed back into a prompt. Hidden reasoning text is not kept.
    response: result.response.slice(0, 6000),
  };
}

export async function runQuestions({ states, models, modes, request, blocked, checkpoint = async () => {}, clock = () => performance.now(), report }) {
  // Per model and mode: a fast sort between two slow invents must not reset the count.
  const timeouts = {};
  report.requests ??= [];
  try {
    // State by state, both modes, so a budget stop leaves invent and sort for the same prefix.
    for (const state of states) {
      for (const mode of modes) {
        if (mode === 'sort' && !state.control) continue;
        for (const model of models) {
          const key = `${model} ${mode}`;
          if ((timeouts[key] ?? 0) >= TIMEOUTS_BEFORE_SKIP) {
            report.requests.push({ state: state.id, model, mode, outcome: 'skipped-after-timeouts' });
            continue;
          }
          const record = await ask({ request, model, mode, state, blocked, clock });
          timeouts[key] = record.outcome === 'timeout' ? (timeouts[key] ?? 0) + 1 : 0;
          report.requests.push(record);
          await checkpoint(report);
          console.error(`${mode} ${state.id} ${model}: ${record.outcome}`);
        }
      }
    }
    report.status = 'complete';
  } catch (error) {
    if (!(error instanceof BenchmarkStop)) throw error;
    report.status = 'stopped';
    report.stopReason = error.message;
  }
  report.finishedAt = new Date().toISOString();
  await checkpoint(report);
  return report;
}

// A tiny fixed sort, one per model, to see each envelope, usage and hidden reasoning first.
export const PROBE_STATE = Object.freeze({ id: 'probe', candidates: Object.freeze(['crane', 'eagle', 'hammer', 'robin', 'table', 'tiger']),
  control: Object.freeze({ code: 'c', question: 'Can your word mean a bird?' }) });

// Cost projection from the probes: each model's hidden tokens per request, plus the visible
// lists (about 4.5 tokens a candidate) and the prompt (about 3 characters a token).
export function projectCost(probes, states) {
  const projection = {};
  for (const probe of probes) {
    if (!probe.usage) { projection[probe.model] = null; continue; }
    const hidden = Math.max(0, probe.usage.completion_tokens - Math.ceil(probe.visibleChars / 3));
    let total = 0;
    for (const mode of ['invent', 'sort']) {
      for (const state of states) {
        const input = questionInput(mode, state.candidates, { question: mode === 'sort' ? state.control.question : null, maxTokens: 1 });
        total += neuronEstimate(probe.model, { prompt_tokens: Math.ceil(JSON.stringify(input.messages).length / 3),
          completion_tokens: hidden + Math.ceil(40 + state.candidates.length * 4.5) });
      }
    }
    projection[probe.model] = { hiddenTokensPerRequest: hidden, projectedNeurons: Math.round(total) };
  }
  return projection;
}

function rate(part, whole) { return whole ? round2(part / whole) : null; }

// Scores one model and mode. Invent questions are scored only where `mapping` judged them
// equivalent to a category (or a union); every question with valid lists must be in it.
export function summarizeGroup(records, statesById, mode, mapping = null) {
  const sent = records.filter(r => r.outcome !== 'skipped-after-timeouts');
  const answered = sent.filter(r => r.outcome !== 'timeout');
  const outcomes = {};
  for (const r of records) outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
  const withLists = answered.filter(r => r.yes);
  const scored = [];
  const unmapped = [];
  for (const r of withLists) {
    const state = statesById[r.state];
    let codes = null;
    if (mode === 'sort') codes = [state.control.code];
    else {
      const key = r.question.trim().toLowerCase();
      if (!mapping || !Object.hasOwn(mapping.questions, key)) throw new Error(`Unmapped question: ${r.question}`);
      codes = mapping.questions[key].codes;
      if (!codes) { unmapped.push(r.state); continue; }
    }
    const labels = new Map(Object.entries(state.labels).filter(([, label]) => label !== null));
    const score = scoreSort(r, labels, codes);
    const placement = answerPlacement(r, state.answer, labels, codes);
    const wrong = [...r.yes.filter(w => labels.has(w) && !codes.some(c => labels.get(w).includes(c))).map(w => `+${w}`),
      ...r.no.filter(w => labels.has(w) && codes.some(c => labels.get(w).includes(c))).map(w => `-${w}`)];
    scored.push({ state: r.state, codes, ...score, answer: placement, disagreements: wrong });
  }
  const pooled = scored.reduce((sum, s) => {
    for (const key of ['labelled', 'correct', 'falseYes', 'falseNo', 'wordnetYes', 'wordnetNo']) sum[key] += s[key];
    return sum;
  }, { labelled: 0, correct: 0, falseYes: 0, falseNo: 0, wordnetYes: 0, wordnetNo: 0 });
  const placements = scored.map(s => s.answer).filter(Boolean);
  const ms = answered.map(r => r.milliseconds);
  const timed = sent.map(r => r.milliseconds);
  const usage = answered.filter(r => r.usage);
  const neurons = answered.filter(r => r.estimatedNeurons !== null).map(r => r.estimatedNeurons);
  const reasoningReported = usage.filter(r => Number.isInteger(r.usage.reasoning_tokens));
  const shares = withLists.map(r => r.yesShare);
  return {
    requests: records.length, sent: sent.length, outcomes,
    acceptedRate: rate(outcomes.accepted ?? 0, records.length),
    strictJsonRate: rate(answered.filter(r => r.strictJson).length, records.length),
    validListsRate: rate(withLists.length, records.length),
    invalidRate: rate(records.length - withLists.length, records.length),
    split: { meanYesShare: round2(mean(shares)), meanDistanceFromHalf: round2(mean(shares.map(s => Math.abs(s - 0.5)))),
      inBand: shares.filter(s => s >= MIN_YES_SHARE && s <= MAX_YES_SHARE).length, withValidLists: shares.length },
    accuracy: { scoredRequests: scored.length, unmappedQuestions: unmapped.length, ...pooled,
      accuracy: rate(pooled.correct, pooled.labelled), falseYesRate: rate(pooled.falseYes, pooled.wordnetNo),
      falseNoRate: rate(pooled.falseNo, pooled.wordnetYes),
      answerChecked: placements.length, answerMisfiled: placements.filter(p => p.misfiled).length },
    latencyMs: { p50: round2(percentile(ms, 0.5)), p95: round2(percentile(ms, 0.95)), max: round2(ms.length ? Math.max(...ms) : null),
      within3s: rate(timed.filter(t => t <= 3000).length, sent.length), within5s: rate(timed.filter(t => t <= 5000).length, sent.length),
      within8s: rate(timed.filter(t => t <= 8000).length, sent.length) },
    tokens: { requestsWithUsage: usage.length, meanPrompt: round2(mean(usage.map(r => r.usage.prompt_tokens))),
      meanCompletion: round2(mean(usage.map(r => r.usage.completion_tokens))),
      meanReportedReasoning: round2(mean(reasoningReported.map(r => r.usage.reasoning_tokens))),
      // Approximate: completion tokens beyond the visible reply at ~3 characters a token.
      meanHiddenApprox: round2(mean(usage.map(r => Math.max(0, r.usage.completion_tokens - Math.ceil(r.visibleChars / 3))))),
      cutOffByLength: answered.filter(r => r.finishReason === 'length' || r.finishReason === 'incomplete').length },
    neurons: { estimatedTotal: round2(neurons.reduce((a, b) => a + b, 0)), estimatedPerRequest: round2(mean(neurons)),
      providerReportedTotal: round2(answered.filter(r => Number.isFinite(r.providerReportedNeurons)).reduce((a, r) => a + r.providerReportedNeurons, 0)),
      requestsWithoutUsage: answered.length - neurons.length },
    perState: scored,
  };
}

export function summarize(report, statesFile, mapping) {
  const statesById = Object.fromEntries(statesFile.states.map(state => [state.id, state]));
  const summary = {};
  for (const model of report.configuration.models) {
    summary[model] = {};
    for (const mode of report.configuration.modes) {
      summary[model][mode] = summarizeGroup(report.requests.filter(r => r.model === model && r.mode === mode), statesById, mode, mapping);
    }
  }
  return summary;
}

async function main() {
  const args = process.argv.slice(2);
  const value = flag => {
    const i = args.indexOf(flag);
    if (i < 0) return null;
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${flag}`);
    return args[i + 1];
  };
  const statesPath = resolve(value('--states') ?? resolve(ROOT, 'tools/benchmarks/illucia-d1-states.json'));
  if (args.includes('--build-states')) {
    const file = await writeStates(statesPath);
    console.log(`States: ${statesPath} (${file.states.length}, ${file.statesSha256})`);
    return;
  }
  const statesFile = JSON.parse(await readFile(statesPath, 'utf8'));
  if (hash(statesFile.states) !== statesFile.statesSha256) throw new Error('States file hash mismatch.');
  if (value('--summarize')) {
    const reportPath = resolve(value('--summarize'));
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    const mapping = JSON.parse(await readFile(resolve(value('--mapping')), 'utf8'));
    report.mappingSha256 = hash(mapping);
    report.summary = summarize(report, statesFile, mapping);
    await atomicJson(reportPath, report);
    console.log(`Summary written to ${reportPath}`);
    return;
  }
  const phase = value('--phase');
  const output = value('--output');
  if (!args.includes('--live') || !args.includes('--free-plan') || !output || !['probe', 'run'].includes(phase)) {
    throw new Error('Live use: --live --free-plan --phase probe|run --output <path> [--wrangler-auth] [--models a,b]. Workers Free accounts only.');
  }
  const models = value('--models')?.split(',') ?? Object.keys(QUESTION_MODELS);
  if (!models.length || models.some(m => !Object.hasOwn(QUESTION_MODELS, m)) || new Set(models).size !== models.length) {
    throw new Error('Models must come from the D1 allowlist.');
  }
  const blocked = await loadBlocked();
  const session = await openLiveSession({ wrangler: args.includes('--wrangler-auth'),
    transportOptions: { timeoutMs: TIMEOUT_MS, normalize: result => normalizeQuestionResult(result, BenchmarkStop) } });
  try {
    const states = phase === 'probe' ? [PROBE_STATE] : statesFile.states;
    const modes = phase === 'probe' ? ['sort'] : ['invent', 'sort'];
    const report = {
      schemaVersion: 1, phase, startedAt: new Date().toISOString(), status: 'running',
      configuration: { models, modes, promptVersion: QUESTION_PROMPT_VERSION,
        prompts: { invent: INVENT_PROMPT, sort: SORT_PROMPT }, promptSha256: hash([INVENT_PROMPT, SORT_PROMPT]),
        statesSha256: phase === 'probe' ? hash([PROBE_STATE]) : statesFile.statesSha256,
        temperature: 0, seed: SEED, maxTokens: MAX_TOKENS, modelOptions: MODEL_OPTIONS, requestTimeoutMs: TIMEOUT_MS,
        retries: 0, timeoutsBeforeSkip: TIMEOUTS_BEFORE_SKIP, evenSplit: [MIN_YES_SHARE, MAX_YES_SHARE],
        blockedTerms: blocked.length, neuronRates: Object.fromEntries(models.map(m => [m, QUESTION_MODELS[m]])), pricingChecked: '2026-10-02' },
      environment: { node: process.version, platform: process.platform },
    };
    const checkpoint = current => atomicJson(resolve(output), { ...current, budget: session.budget() });
    await runQuestions({ states, models, modes, request: session.request, blocked, checkpoint, report });
    if (phase === 'probe') {
      report.projection = projectCost(report.requests.filter(r => r.usage !== undefined), statesFile.states);
      await checkpoint(report);
      console.log(JSON.stringify(report.projection, null, 2));
    }
    console.log(`Report: ${output} (${report.status}${report.stopReason ? `: ${report.stopReason}` : ''})`);
    if (report.status === 'stopped') process.exitCode = 2;
  } finally {
    await session.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Setup errors are ours; never print anything that could carry credentials.
    console.error(error instanceof Error && !/token|auth/i.test(error.message) ? error.message
      : 'Benchmark failed. Check options, credentials, output access and the local budget lock. No credentials are logged.');
    process.exitCode = 1;
  });
}
