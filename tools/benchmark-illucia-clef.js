// Track D: Clef and Clef-flash as the sorter for Illucia's AI question (see lib/illucia-clef.js).
// Two tasks on the frozen D1 states:
//   control  — sort under the state's WordNet control question (as D1's sort table);
//   llama    — sort under each question Llama 3.3 70B invented and D1 accepted (the pairing
//              "Llama writes, Clef sorts"), scored against WordNet where the reviewed mapping
//              allows, and compared with Llama's own lists.
// Live use reuses the I7a/D1 session (credentials in memory, lock, daily ledger).
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicJson, openLiveSession } from './benchmark-illucia-models.js';
import { limitRun, summarizeGroup } from './benchmark-illucia-questions.js';
import { neuronEstimate, BenchmarkStop } from './lib/illucia-model.js';
import { MIN_YES_SHARE, MAX_YES_SHARE } from './lib/illucia-question-model.js';
import { CLEF_MODELS, CLEF_STATE, clefInputs, clefProbabilities, clefSort, clefUsage } from './lib/illucia-clef.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const json = async path => JSON.parse(await readFile(resolve(ROOT, 'tools/benchmarks', path), 'utf8'));
const round = value => Math.round(value * 10000) / 10000;

// One sort: every chunk must answer every candidate it was asked about.
export async function clefSortRequest(request, model, candidates, question, clock = () => performance.now()) {
  const start = clock();
  const probabilities = {};
  let promptTokens = 0;
  let usageKnown = true;
  for (const input of clefInputs(model, candidates, question)) {
    const raw = await request(model, input);
    const usage = clefUsage(raw);
    if (usage) promptTokens += usage.prompt_tokens; else usageKnown = false;
    const part = clefProbabilities(raw, Object.keys(input.questions));
    if (!part) return { outcome: 'wrong-lists', milliseconds: clock() - start };
    Object.assign(probabilities, part);
  }
  const usage = usageKnown ? { prompt_tokens: promptTokens, completion_tokens: 0 } : null;
  const sort = clefSort(probabilities, candidates);
  return {
    outcome: sort.yesShare < MIN_YES_SHARE || sort.yesShare > MAX_YES_SHARE ? 'uneven' : 'accepted',
    strictJson: true, ...sort, probabilities, milliseconds: clock() - start,
    usage, estimatedNeurons: usage ? neuronEstimate(model, usage) : null, visibleChars: 0, finishReason: 'stop',
  };
}

// Llama 3.3 70B's accepted invented questions from the full D1 run, one per state.
export function llamaQuestions(reports) {
  return reports.flatMap(report => report.requests)
    .filter(r => r.mode === 'invent' && r.outcome === 'accepted')
    .map(r => ({ state: r.state, question: r.question.trim(), yes: r.yes, no: r.no }));
}

export async function runClef({ request, models, states, questions, checkpoint = async () => {}, report }) {
  report.requests ??= [];
  try {
    for (const state of states) {
      const tasks = [{ task: 'control', question: state.control.question }];
      const invented = questions.find(q => q.state === state.id);
      if (invented) tasks.push({ task: 'llama', question: invented.question });
      for (const { task, question } of tasks) {
        for (const model of models) {
          const result = await clefSortRequest(request, model, state.candidates, question);
          report.requests.push({ state: state.id, model, task, question, mode: task === 'control' ? 'sort' : 'invent', ...result });
          await checkpoint(report);
          console.error(`${task} ${state.id} ${model}: ${result.outcome}`);
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

// Agreement with Llama's own lists, word by word, over the questions both sorted.
export function agreementWithLlama(records, questions) {
  let same = 0;
  let total = 0;
  for (const record of records.filter(r => r.task === 'llama' && r.yes)) {
    const llama = questions.find(q => q.state === record.state);
    const llamaYes = new Set(llama.yes);
    for (const word of [...record.yes, ...record.no]) {
      total++;
      if (record.yes.includes(word) === llamaYes.has(word)) same++;
    }
  }
  return { words: total, agree: same, rate: total ? round(same / total) : null };
}

export function summarizeClef(report, statesFile, mapping, questions) {
  const statesById = Object.fromEntries(statesFile.states.map(state => [state.id, state]));
  const summary = {};
  for (const model of report.configuration.models) {
    const mine = report.requests.filter(r => r.model === model);
    summary[model] = {
      control: summarizeGroup(mine.filter(r => r.task === 'control'), statesById, 'sort'),
      llamaQuestions: { ...summarizeGroup(mine.filter(r => r.task === 'llama'), statesById, 'invent', mapping),
        agreementWithLlama: agreementWithLlama(mine, questions) },
    };
  }
  return summary;
}

async function main() {
  const args = process.argv.slice(2);
  const value = flag => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
  const output = value('--output');
  if (!args.includes('--live') || !args.includes('--free-plan') || !output) {
    throw new Error('Live use: --live --free-plan --output <path> [--wrangler-auth] [--max-run-neurons 200]. Workers Free accounts only.');
  }
  const statesFile = await json('illucia-d1-states.json');
  const mapping = await json('illucia-d1-mapping.json');
  const questions = llamaQuestions([await json('illucia-d1-llama70b.json'), await json('illucia-d1-llama70b-part2.json')]);
  const models = Object.keys(CLEF_MODELS);
  const maxRunNeurons = Number(value('--max-run-neurons') ?? 200);
  const session = await openLiveSession({ wrangler: args.includes('--wrangler-auth'),
    // The ledger settles from prompt_tokens; Clef reports input_tokens.
    transportOptions: { timeoutMs: 30000, normalize: raw => ({ ...raw, usage: clefUsage(raw) }) } });
  try {
    const report = {
      schemaVersion: 1, startedAt: new Date().toISOString(), status: 'running',
      configuration: { models, state: CLEF_STATE, threshold: 0.5, evenSplit: [MIN_YES_SHARE, MAX_YES_SHARE], maxRunNeurons,
        statesSha256: statesFile.statesSha256, llamaQuestions: questions.length, pricingChecked: '2026-10-03',
        neuronRates: '21,818 per M input tokens ($0.24 per M), no output charge' },
      environment: { node: process.version, platform: process.platform },
    };
    const request = limitRun(session.request, () => session.budget().reservedNeurons, maxRunNeurons,
      (model, input) => neuronEstimate(model, { prompt_tokens: Buffer.byteLength(JSON.stringify(input)) + 256, completion_tokens: 0 }));
    const checkpoint = current => atomicJson(resolve(output), { ...current, budget: session.budget() });
    await runClef({ request, models, states: statesFile.states, questions, checkpoint, report });
    report.summary = summarizeClef(report, statesFile, mapping, questions);
    await checkpoint(report);
    console.log(`Report: ${output} (${report.status}${report.stopReason ? `: ${report.stopReason}` : ''})`);
  } finally {
    await session.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error && !/token|auth/i.test(error.message) ? error.message : 'Benchmark failed. No credentials are logged.');
    process.exitCode = 1;
  });
}
