import test from 'node:test';
import assert from 'node:assert/strict';
import { createRound, applyGuess } from '../client/src/lib/hangman-core.js';
import { toPublicState } from '../client/src/lib/illucia/public-state.js';
import { createKnowledge, parseLexicon } from '../client/src/lib/illucia/lexicon.js';
import { explainedInput, parseExplainedLetter } from './lib/illucia-dictionary-model.js';
import { playModel, developmentSample } from './benchmark-illucia-models.js';
import { loadLexicons } from './benchmark-illucia.js';
import { normalizeModelResult } from './lib/illucia-model.js';

// Tiny 3-letter fixtures bypass the word-file parser, whose contract is lengths 4-15.
const entriesOf = text => text.trim().split('\n').map(line => {
  const [word, size] = line.split(' ');
  return Object.freeze({ word, size: Number(size) });
});

const model = '@cf/meta/llama-3.1-8b-instruct-fp8-fast';
const knowledge = createKnowledge(parseLexicon('eerie 35\nelope 35\nelude 35\n', 5));
const stateFor = word => toPublicState(applyGuess(createRound(word), 'e'));

test('provider JSON response objects use original generated text; unknown envelopes stop rather than triggering fallback', () => {
  const content = '{"reason":"Shared letter.","letter":"L"}';
  const result = normalizeModelResult({ response: JSON.parse(content), choices: [{ message: { content } }],
    usage: { prompt_tokens: 200, completion_tokens: 25 }, model: 'backend-v2' });
  assert.equal(result.response, content);
  assert.equal(result.providerModel, 'backend-v2');
  assert.equal(parseExplainedLetter(result.response, stateFor('elope')).letter, 'l');
  assert.throws(() => normalizeModelResult({ response: { letter: 'l' } }), /response-format/);
});

test('candidate assistance depends only on public state, with exact repeated-letter positions and no answer marker', () => {
  const input = explainedInput(stateFor('elope'), knowledge, false, true);
  assert.deepEqual(input, explainedInput(stateFor('elude'), knowledge, false, true));
  const board = JSON.parse(input.messages[1].content);
  assert.deepEqual(board.candidates, ['elope', 'elude']);
  assert.equal(board.answer, undefined);
  assert.equal(board.suggestedLetter, undefined);
  assert.equal(board.pattern, 'e _ _ _ e');
  assert.throws(() => explainedInput(createRound('elope'), knowledge, false, true), /toPublicState/);
  assert.throws(() => explainedInput(toPublicState(applyGuess(createRound('eee'), 'e')), knowledge, false, true), /round ends/);
  assert.throws(() => explainedInput(toPublicState(createRound('cat')), knowledge, false, true), /length mismatch/);
});

test('board-only control has the same output budget and board, with dictionary data omitted', () => {
  const state = stateFor('elope');
  const withDictionary = explainedInput(state, knowledge, false, true);
  const control = explainedInput(state, knowledge);
  const board = JSON.parse(withDictionary.messages[1].content);
  delete board.candidates;
  assert.deepEqual(board, JSON.parse(control.messages[1].content));
  assert.equal(control.max_tokens, withDictionary.max_tokens);
  assert.equal(control.max_tokens, 160);
});

test('JSON reply parsing rejects repeated letters, extra fields, overlong explanations and non-JSON prose', () => {
  const state = stateFor('elope');
  assert.deepEqual(parseExplainedLetter('{"reason":"Both words contain L.","letter":"L"}', state),
    { letter: 'l', reason: null, explanation: 'Both words contain L.' });
  assert.equal(parseExplainedLetter('{"reason":"","letter":"E"}', state).reason, 'repeated');
  for (const reply of ['L', '```json\n{"reason":"","letter":"L"}\n```',
    '{"reason":"","letter":"L","answer":"elope"}', '{"letter":"L"}',
    JSON.stringify({ reason: 'x'.repeat(241), letter: 'l' }), JSON.stringify({ reason: '', letter: 'elope' })]) {
    assert.equal(parseExplainedLetter(reply, state).reason, 'invalid');
  }
});

test('dictionary mode records complete assistance evidence without falsely claiming fallback', async () => {
  const k = createKnowledge(entriesOf('cat 35\ndog 35\n'));
  const letters = [...'cat'];
  const game = await playModel('cat', k, model, async (_, input) => {
    assert.ok(JSON.parse(input.messages[1].content).candidates.includes('cat'));
    return { response: JSON.stringify({ reason: 'Test choice.', letter: letters.shift() }),
      usage: { prompt_tokens: 100, completion_tokens: 20 } };
  }, () => 0, 'dictionary-explained');
  assert.equal(game.won, true);
  assert.equal(game.firstIntervention, null);
  assert.deepEqual(game.attempts.map(a => a.candidateCount), [2, 1, 1]);
  assert.ok(game.attempts.every(a => a.inputSha256.length === 64 && a.explanation === 'Test choice.'));
});

test('development sample is fixed, accepted, common, and includes DOUBT exactly once', async () => {
  const { entriesByLength } = await loadLexicons();
  const sample = developmentSample(entriesByLength);
  assert.deepEqual(sample, developmentSample(entriesByLength));
  assert.equal(sample.length, 10);
  assert.equal(new Set(sample.map(e => e.word)).size, 10);
  assert.equal(sample[0].word, 'doubt');
  assert.ok(sample.every(e => e.length === 5 && e.size === 35));
  const input = explainedInput(toPublicState(createRound('doubt')), createKnowledge(entriesByLength[5]), false, true);
  assert.equal(JSON.parse(input.messages[1].content).candidates.length, entriesByLength[5].length);
});
