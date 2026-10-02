import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createKnowledge } from '../client/src/lib/illucia/lexicon.js';
import { loadLexicons } from './benchmark-illucia.js';
import { BenchmarkStop } from './lib/illucia-model.js';
import { buildStates, runQuestions, summarizeGroup, projectCost, loadBlocked, PROBE_STATE, MODEL_OPTIONS } from './benchmark-illucia-questions.js';

const statesFile = JSON.parse(await readFile(new URL('./benchmarks/illucia-d1-states.json', import.meta.url), 'utf8'));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const qwen = '@cf/qwen/qwen3-30b-a3b-fp8';
const gemma = '@cf/google/gemma-4-26b-a4b-it';
const usage = { prompt_tokens: 300, completion_tokens: 200, reasoning_tokens: null };
const okReply = state => {
  const half = Math.ceil(state.candidates.length / 2);
  return { response: JSON.stringify({ question: 'Can your word mean a man-made object?',
    yes: state.candidates.slice(0, half), no: state.candidates.slice(half) }),
  envelope: 'choices', finishReason: 'stop', reasoningChars: 0, providerModel: null, usage };
};
const state = { id: 's1', answer: 'crane', candidates: ['crane', 'eagle', 'hammer', 'robin', 'table', 'tiger'],
  labels: { crane: 'bcoM', eagle: 'bc', hammer: 'nop', robin: 'bca', table: 'ot', tiger: null },
  control: { code: 'c', question: 'Can your word mean a bird?' } };

test('committed states rebuild exactly from the word and label files, and each is a real board', async () => {
  const { entriesByLength } = await loadLexicons();
  const dir = new URL('../client/public/illucia/labels/', import.meta.url);
  const labelsByLength = {};
  for (let length = 4; length <= 10; length++) {
    labelsByLength[length] = new Map((await readFile(new URL(`${length}.txt`, dir), 'utf8')).trim().split('\n').map(line => line.split(' ')));
  }
  const { categories } = JSON.parse(await readFile(new URL('categories.json', dir), 'utf8'));
  const states = buildStates(entriesByLength, labelsByLength, categories);
  assert.equal(hash(states), statesFile.statesSha256);
  assert.equal(hash(statesFile.states), statesFile.statesSha256);
  assert.equal(states.length, 21);
  assert.equal(new Set(states.map(s => s.answer)).size, 21);
  for (const s of states) {
    const pattern = [...s.pattern].map(letter => (letter === '_' ? null : letter));
    const board = { length: s.length, pattern, guessedLetters: [...s.guessedLetters], missedLetters: [...s.missedLetters] };
    // filterCandidates only accepts registered public states, so the same rule is checked by hand.
    const guessed = new Set(board.guessedLetters);
    const expected = createKnowledge(entriesByLength[s.length], s.maxSize).words.filter(word =>
      pattern.every((letter, i) => (letter === null ? !guessed.has(word[i]) : word[i] === letter)));
    assert.deepEqual(s.candidates, expected, s.id);
    assert.ok(s.candidates.length >= 8 && s.candidates.length <= 80, s.id);
    assert.ok(s.candidates.includes(s.answer), s.id);
    assert.ok(s.control.labelledYesShare >= 0.1 && s.control.labelledYesShare <= 0.9, s.id);
  }
});

test('requests depend on the candidates only: two answers with the same candidates send identical bytes', async () => {
  const sent = [];
  const request = async (model, input) => { sent.push(JSON.stringify(input)); return okReply(state); };
  const report = {};
  await runQuestions({ states: [state, { ...state, id: 's2', answer: 'tiger' }], models: [qwen], modes: ['invent', 'sort'],
    request, blocked: [], report, clock: () => 0 });
  assert.equal(sent.length, 4);
  assert.equal(sent[0], sent[1]);
  assert.equal(sent[2], sent[3]);
  assert.notEqual(sent[0], sent[2]);
  for (const body of sent) assert.equal(body.includes('"answer"'), false);
  assert.equal(report.status, 'complete');
  assert.deepEqual(report.requests.map(r => r.outcome), ['accepted', 'accepted', 'accepted', 'accepted']);
});

test('model options are merged into that model\'s requests only', async () => {
  const bodies = {};
  const request = async (model, input) => { bodies[model] = input; return okReply(state); };
  await runQuestions({ states: [state], models: [qwen, '@cf/openai/gpt-oss-20b'], modes: ['sort'], request, blocked: [], report: {}, clock: () => 0 });
  assert.equal(bodies['@cf/openai/gpt-oss-20b'].reasoning_effort, MODEL_OPTIONS['@cf/openai/gpt-oss-20b'].reasoning_effort);
  assert.equal(Object.hasOwn(bodies[qwen], 'reasoning_effort'), false);
});

test('timeouts fail the state; three in a row skip that model; other models carry on', async () => {
  const states = Array.from({ length: 5 }, (_, i) => ({ ...state, id: `t${i}` }));
  const request = async model => {
    if (model === qwen) throw new BenchmarkStop('timeout');
    return okReply(state);
  };
  const report = {};
  await runQuestions({ states, models: [qwen, gemma], modes: ['sort'], request, blocked: [], report, clock: () => 0 });
  const outcomes = model => report.requests.filter(r => r.model === model).map(r => r.outcome);
  assert.deepEqual(outcomes(qwen), ['timeout', 'timeout', 'timeout', 'skipped-after-timeouts', 'skipped-after-timeouts']);
  assert.deepEqual(outcomes(gemma), Array(5).fill('accepted'));
  assert.equal(report.status, 'complete');
});

test('any other stop ends the run with partial evidence checkpointed', async () => {
  let calls = 0;
  const request = async () => { if (++calls === 2) throw new BenchmarkStop('local-budget'); return okReply(state); };
  const checkpoints = [];
  const report = {};
  await runQuestions({ states: [state, { ...state, id: 's2' }], models: [qwen], modes: ['invent', 'sort'], request, blocked: [], report,
    checkpoint: async value => checkpoints.push(structuredClone(value)), clock: () => 0 });
  assert.equal(report.status, 'stopped');
  assert.equal(report.stopReason, 'local-budget');
  assert.equal(report.requests.length, 1);
  assert.equal(checkpoints.at(-1).status, 'stopped');
  await assert.rejects(runQuestions({ states: [state], models: [qwen], modes: ['sort'], request: async () => { throw new TypeError('bug'); },
    blocked: [], report: {}, clock: () => 0 }), TypeError);
});

test('summaries score sort mode against the control, invent mode only through the reviewed mapping', () => {
  const statesById = { s1: state };
  const sortRecord = { state: 's1', model: qwen, mode: 'sort', outcome: 'accepted', strictJson: true, milliseconds: 1000,
    yes: ['crane', 'eagle', 'table'], no: ['hammer', 'robin', 'tiger'], yesShare: 0.5, usage, estimatedNeurons: 7.5,
    providerReportedNeurons: null, visibleChars: 150, finishReason: 'stop' };
  const sort = summarizeGroup([sortRecord, { state: 's1', model: qwen, mode: 'sort', outcome: 'timeout', milliseconds: 30000 }], statesById, 'sort');
  // Labelled: crane, eagle, robin (YES) and hammer, table (NO); tiger is unknown.
  assert.deepEqual([sort.accuracy.labelled, sort.accuracy.correct, sort.accuracy.falseYes, sort.accuracy.falseNo], [5, 3, 1, 1]);
  assert.equal(sort.accuracy.answerMisfiled, 0);
  assert.deepEqual(sort.perState[0].disagreements, ['+table', '-robin']);
  assert.equal(sort.acceptedRate, 0.5);
  assert.equal(sort.latencyMs.within3s, 0.5);
  assert.equal(sort.outcomes.timeout, 1);
  const invent = { ...sortRecord, mode: 'invent', question: 'Can your word mean a bird?' };
  assert.throws(() => summarizeGroup([invent], statesById, 'invent', { questions: {} }), /Unmapped/);
  const mapped = summarizeGroup([invent], statesById, 'invent', { questions: { 'can your word mean a bird?': { codes: ['c'] } } });
  assert.equal(mapped.accuracy.correct, 3);
  const skipped = summarizeGroup([invent], statesById, 'invent', { questions: { 'can your word mean a bird?': { codes: null } } });
  assert.deepEqual([skipped.accuracy.scoredRequests, skipped.accuracy.unmappedQuestions, skipped.accuracy.accuracy], [0, 1, null]);
  // The real word on the wrong side is counted.
  const misfiled = summarizeGroup([{ ...sortRecord, yes: ['eagle', 'robin', 'table'], no: ['crane', 'hammer', 'tiger'] }], statesById, 'sort');
  assert.equal(misfiled.accuracy.answerMisfiled, 1);
});

test('the cost projection grows with hidden reasoning', () => {
  const probe = hidden => ({ model: qwen, usage: { prompt_tokens: 200, completion_tokens: hidden + 30 }, visibleChars: 90 });
  const quiet = projectCost([probe(0)], statesFile.states)[qwen];
  const thinking = projectCost([probe(1000)], statesFile.states)[qwen];
  assert.equal(quiet.hiddenTokensPerRequest, 0);
  assert.equal(thinking.hiddenTokensPerRequest, 1000);
  assert.ok(thinking.projectedNeurons > quiet.projectedNeurons + 1000);
  assert.equal(projectCost([{ model: qwen, usage: null }], statesFile.states)[qwen], null);
  assert.equal(PROBE_STATE.candidates.length, 6);
});

test('the blocked-term list loads at its pinned hash when the vocabulary cache exists', async t => {
  let blocked;
  try { blocked = await loadBlocked(); } catch (error) {
    if (error.code === 'ENOENT') return t.skip('vocabulary cache not downloaded');
    throw error;
  }
  assert.ok(blocked.length > 300);
  assert.ok(blocked.includes('chink'));
  assert.ok(blocked.every(term => /^[a-z]+( [a-z]+)*$/.test(term)));
});
