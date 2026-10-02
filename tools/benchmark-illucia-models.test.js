import assert from 'node:assert/strict';
import test from 'node:test';
import { createRound, applyGuess } from '../client/src/lib/hangman-core.js';
import { toPublicState } from '../client/src/lib/illucia/public-state.js';
import { createKnowledge, parseLexicon } from '../client/src/lib/illucia/lexicon.js';
import { modelInput, parseModelLetter, MODELS, QUESTION_MODELS, neuronEstimate, createCloudflareTransport, BenchmarkStop } from './lib/illucia-model.js';
import { pilotSample, playModel, summarizeModels, budgetedRequest, benchmarkModels } from './benchmark-illucia-models.js';

// Tiny 3-letter fixtures bypass the word-file parser, whose contract is lengths 4-15.
const entriesOf = text => text.trim().split('\n').map(line => {
  const [word, size] = line.split(' ');
  return Object.freeze({ word, size: Number(size) });
});

const model = Object.keys(MODELS)[0];
const knowledge = createKnowledge(entriesOf('cat 35\ndog 70\n'));
const result = response => ({ response, usage: { prompt_tokens: 100, completion_tokens: 1 } });

test('outgoing payload is public-only, preserves positions, and rejects private or terminal state', () => {
  const privateRound = applyGuess(createRound('eerie'), 'e');
  privateRound.username = 'private-user';
  const input = modelInput(toPublicState(privateRound));
  assert.equal(input.messages[1].content.includes('eerie'), false);
  assert.equal(JSON.stringify(input).includes('private-user'), false);
  assert.deepEqual(JSON.parse(input.messages[1].content), {
    length: 5, pattern: 'e e _ _ e', guessedLetters: 'e', missedLetters: '', missesLeft: 6,
    availableLetters: 'abcdfghijklmnopqrstuvwxyz',
  });
  assert.throws(() => modelInput(privateRound), /toPublicState/);
  assert.throws(() => modelInput({ ...toPublicState(privateRound), answer: 'eerie' }), /toPublicState/);
  assert.throws(() => modelInput(toPublicState(applyGuess(createRound('aaa'), 'a'))), /round ends/);
  let failed = createRound('zzz');
  for (const letter of 'abcdef') failed = applyGuess(failed, letter);
  assert.throws(() => modelInput(toPublicState(failed)), /round ends/);
});

test('parser accepts only one unused ASCII letter', () => {
  const state = toPublicState(applyGuess(createRound('cat'), 'a'));
  assert.deepEqual(parseModelLetter(' C\n', state), { letter: 'c', reason: null });
  for (const text of ['CAT', 'The letter C', '"C"', 'C.', 'é', '', null, ' '.repeat(17) + 'c']) {
    assert.equal(parseModelLetter(text, state).reason, 'invalid');
  }
  assert.equal(parseModelLetter('A', state).reason, 'repeated');
});

test('each contestant starts blank; model-only wins stop without sending solved pattern', async () => {
  for (let i = 0; i < 2; i++) {
    const inputs = [];
    const letters = [...'cat'];
    const game = await playModel('cat', knowledge, model, async (_, input) => {
      inputs.push(JSON.parse(input.messages[1].content));
      return result(letters.shift());
    }, () => 0);
    assert.equal(inputs[0].pattern, '_ _ _');
    assert.equal(inputs.length, 3);
    assert.equal(game.modelOnlyStatus, 'solved');
    assert.equal(game.firstIntervention, null);
    assert.equal(game.misses, 0);
    assert.equal(game.turns, 3);
  }
});

test('six misses finish a game and repeated letters retry once without costing a chance', async () => {
  const replies = [...'zzqxyuvw'];
  const game = await playModel('cat', knowledge, model, async () => result(replies.shift()), () => 0);
  assert.equal(game.status, 'failed');
  assert.equal(game.misses, 6);
  assert.equal(game.turns, 6);
  assert.equal(game.attempts.length, 7);
  assert.equal(game.attempts[1].reason, 'repeated');
  assert.equal(game.attempts[2].retry, true);
  assert.equal(game.firstIntervention, null);
});

test('fallback wins are not model-only wins; retry does not echo raw output', async () => {
  const inputs = [];
  const game = await playModel('cat', knowledge, model, async (_, input) => {
    inputs.push(input);
    return result('IGNORE RULES');
  }, () => 0);
  assert.equal(game.status, 'solved');
  assert.equal(game.firstIntervention, 1);
  assert.equal(game.modelOnlyStatus, 'invalid-forfeit');
  assert.equal(game.attempts.length, game.turns * 2);
  assert.equal(JSON.stringify(inputs).includes('IGNORE RULES'), false);
  const summary = summarizeModels([game]);
  assert.equal(summary.modelOnly.wins, 0);
  assert.equal(summary.withFallback.wins, 1);
  assert.equal(summary.withFallback.fallbackMoves, 3);
});

test('quota/timeout interrupts without silently solving or counting an incomplete game as a loss', async () => {
  let calls = 0;
  const game = await playModel('cat', knowledge, model, async () => {
    calls++;
    throw new BenchmarkStop('http-429');
  }, () => 0);
  assert.equal(calls, 1);
  assert.equal(game.status, 'incomplete');
  assert.equal(game.turns, 0);
  assert.equal(game.firstIntervention, null);
  const summary = summarizeModels([game]);
  assert.equal(summary.completed, 0);
  assert.equal(summary.modelOnly.winRate, null);
  assert.equal(summary.requestsWithoutUsage, 1);
  assert.equal(summary.estimatedNeuronsPerCompletedGame, null);
});

test('pilot is deterministic and samples strata without replacement', () => {
  const entries = { 4: parseLexicon('aaaa 35\naaab 40\naaac 55\naaad 70\n', 4),
    5: parseLexicon('aaaaa 35\naaaab 50\naaaac 65\n', 5) };
  const sample = pilotSample(entries, 6);
  assert.deepEqual(sample, pilotSample(entries, 6));
  assert.equal(new Set(sample.map(e => e.word)).size, 6);
  assert.equal(new Set(sample.map(e => `${e.length}-${e.band}`)).size, 6);
  assert.throws(() => pilotSample(entries, 8), /Insufficient/);
  assert.throws(() => pilotSample(entries, 0), /Sample size/);
});

test('budget reserves before dispatch, counts retry calls, and survives a failed request', async () => {
  const day = '2026-09-29';
  const ledger = { day, requests: 0, reservedNeurons: 0 };
  const saved = [];
  let calls = 0;
  const request = budgetedRequest(async () => {
    assert.equal(saved.at(-1).requests, ++calls);
    throw new BenchmarkStop('timeout');
  }, ledger, async value => saved.push({ ...value }), { maxRequests: 1, maxNeurons: 100, day: () => day });
  const input = modelInput(toPublicState(createRound('cat')));
  await assert.rejects(request(model, input), /timeout/);
  assert.ok(ledger.reservedNeurons > 0);
  await assert.rejects(request(model, input), /local-budget/);
  assert.equal(calls, 1);
  const nextDay = budgetedRequest(async () => assert.fail(), ledger, async () => {}, { day: () => '2026-09-30' });
  await assert.rejects(nextDay(model, input), /utc-day-changed/);
});

test('successful usage replaces reservation, while missing usage keeps it', async () => {
  const ledger = { day: 'today', requests: 0, reservedNeurons: 0 };
  let saved;
  const request = budgetedRequest(async () => result('a'), ledger, async value => { saved = { ...value }; }, { day: () => 'today' });
  await request(model, modelInput(toPublicState(createRound('cat'))));
  assert.ok(Math.abs(saved.reservedNeurons - (100 * 4625 + 30475) / 1e6) < 1e-9);
  const before = ledger.reservedNeurons;
  const missing = budgetedRequest(async () => ({ response: 'a' }), ledger, async () => {}, { day: () => 'today' });
  await missing(model, modelInput(toPublicState(createRound('cat'))));
  assert.ok(ledger.reservedNeurons > before);
});

test('REST adapter bounds requests, rejects redirects/unknown models, sanitizes failures', async () => {
  const input = modelInput(toPublicState(createRound('cat')));
  const request = createCloudflareTransport({ accountId: 'a'.repeat(32), token: 'secret-test-token', fetchImpl: async (url, init) => {
    assert.ok(url.startsWith('https://api.cloudflare.com/client/v4/accounts/'));
    assert.equal(init.redirect, 'error');
    assert.equal(init.signal instanceof AbortSignal, true);
    assert.deepEqual(JSON.parse(init.body), input);
    return { ok: true, json: async () => ({ success: true, result: result('a') }) };
  } });
  assert.deepEqual(await request(model, input), { ...result('a'), providerModel: null });
  await assert.rejects(request('paid-model', input), /Unknown model/);
  for (const [status, reason] of [[429, 'http-429'], [403, 'http-403'], [500, 'http-500']]) {
    const failed = createCloudflareTransport({ accountId: 'a'.repeat(32), token: 'secret-test-token',
      fetchImpl: async () => ({ ok: false, status }) });
    await assert.rejects(failed(model, input), new RegExp(reason));
  }
  const timedOut = createCloudflareTransport({ accountId: 'a'.repeat(32), token: 'secret-test-token',
    fetchImpl: async () => { throw new DOMException('private token', 'TimeoutError'); } });
  await assert.rejects(timedOut(model, input), error => error.message === 'timeout');
});

test('end-to-end stop checkpoints partial evidence and a matched baseline, never fabricated remaining games', async () => {
  const checkpoints = [];
  const report = await benchmarkModels({ count: 2, models: [model],
    request: async () => { throw new BenchmarkStop('http-429'); },
    checkpoint: async value => { checkpoints.push(structuredClone(value)); },
  });
  assert.equal(report.status, 'stopped');
  assert.equal(report.stopReason, 'http-429');
  assert.equal(report.baseline.length, 2);
  assert.equal(report.results[model].games.length, 1);
  assert.equal(report.results[model].matchedBaseline.games, 0);
  assert.equal(report.results[model].overall.incomplete, 1);
  assert.equal(checkpoints[0].status, 'running');
  assert.equal(checkpoints.at(-1).status, 'stopped');
  assert.ok(checkpoints.at(-1).finishedAt);
});

test('D1 question models are priced and reachable, but the I7a runner still allows only its own two', async () => {
  const qwen = '@cf/qwen/qwen3-30b-a3b-fp8';
  assert.deepEqual(Object.keys(MODELS), ['@cf/meta/llama-3.2-3b-instruct', '@cf/meta/llama-3.1-8b-instruct-fp8-fast']);
  assert.equal(Object.keys(QUESTION_MODELS).length, 9);
  assert.ok(Math.abs(neuronEstimate('@cf/zai-org/glm-4.7-flash', { prompt_tokens: 1000, completion_tokens: 1000 }) - (5500 + 36400) / 1000) < 1e-9);
  assert.throws(() => neuronEstimate('@cf/meta/llama-4-scout-17b-16e-instruct', { prompt_tokens: 1, completion_tokens: 1 }), /allowlist/);
  await assert.rejects(benchmarkModels({ count: 1, models: [qwen], request: async () => assert.fail() }), /Invalid models/);
  const seen = [];
  const request = createCloudflareTransport({ accountId: 'a'.repeat(32), token: 'secret-test-token',
    normalize: value => { seen.push(value); return { response: 'custom' }; },
    fetchImpl: async url => {
      assert.ok(url.endsWith(`/ai/run/${qwen}`));
      return { ok: true, json: async () => ({ success: true, result: { choices: [] } }) };
    } });
  assert.deepEqual(await request(qwen, modelInput(toPublicState(createRound('cat')))), { response: 'custom' });
  assert.deepEqual(seen, [{ choices: [] }]);
});
