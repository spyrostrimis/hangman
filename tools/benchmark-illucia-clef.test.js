import test from 'node:test';
import assert from 'node:assert/strict';
import { clefSortRequest, llamaQuestions, agreementWithLlama } from './benchmark-illucia-clef.js';

const clef = '@cf/cloudflare/clef-flash';
const yesFor = birds => async (model, input) => ({
  answers: Object.fromEntries(Object.keys(input.questions).map(word => [word, { type: 'noul', noul: birds.includes(word) ? 0.9 : 0.1 }])),
  usage: { input_tokens: 100, output_tokens: 0 },
});

test('a sort asks about every candidate, sums usage over chunks and splits at 0.5', async () => {
  const sent = [];
  const words = Array.from({ length: 70 }, (_, i) => `w${'abcdefghij'[Math.floor(i / 10)]}${'abcdefghij'[i % 10]}z`);
  const birds = words.slice(0, 30);
  const result = await clefSortRequest(async (model, input) => { sent.push(input); return yesFor(birds)(model, input); },
    clef, words, 'Can your word mean a bird?', () => 0);
  assert.equal(sent.length, 2);
  assert.deepEqual(result.yes, birds);
  assert.equal(result.no.length, 40);
  assert.equal(result.outcome, 'accepted');
  assert.deepEqual(result.usage, { prompt_tokens: 200, completion_tokens: 0 });
  // The secret word is not part of a request beyond being one of the candidates; no other field carries words.
  assert.deepEqual(Object.keys(sent[0]), ['model', 'state', 'questions']);
});

test('uneven splits are marked, and a missing answer fails the sort', async () => {
  const words = ['crane', 'eagle', 'robin', 'table', 'tiger'];
  // 1 of 5 is under 25%; 2 of 5 is inside the band.
  assert.equal((await clefSortRequest(yesFor(['crane']), clef, words, 'Can your word mean a bird?', () => 0)).outcome, 'uneven');
  assert.equal((await clefSortRequest(yesFor(['crane', 'eagle']), clef, words, 'Can your word mean a bird?', () => 0)).outcome, 'accepted');
  const partial = async () => ({ answers: { crane: { noul: 0.9 } }, usage: { input_tokens: 10 } });
  assert.equal((await clefSortRequest(partial, clef, words, 'Can your word mean a bird?', () => 0)).outcome, 'wrong-lists');
});

test('Llama questions come from accepted invents only, and agreement counts word by word', () => {
  const reports = [{ requests: [
    { mode: 'invent', outcome: 'accepted', state: 's1', question: ' Can your word mean a bird? ', yes: ['crane'], no: ['table'] },
    { mode: 'invent', outcome: 'uneven', state: 's2', question: 'Can your word mean a fish?', yes: [], no: [] },
    { mode: 'sort', outcome: 'accepted', state: 's1', yes: ['crane'], no: ['table'] },
  ] }];
  const questions = llamaQuestions(reports);
  assert.deepEqual(questions, [{ state: 's1', question: 'Can your word mean a bird?', yes: ['crane'], no: ['table'] }]);
  const agree = agreementWithLlama([{ task: 'llama', state: 's1', yes: ['crane', 'table'], no: [] }], questions);
  assert.deepEqual(agree, { words: 2, agree: 1, rate: 0.5 });
  assert.deepEqual(agreementWithLlama([{ task: 'llama', state: 's1', yes: ['crane'], no: ['table'] }], questions), { words: 2, agree: 2, rate: 1 });
});
