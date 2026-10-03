import test from 'node:test';
import assert from 'node:assert/strict';
import { aboutWord, clefInputs, clefUsage, clefProbabilities, clefReserveTokens, clefSort, CLEF_MAX_QUESTIONS } from './lib/illucia-clef.js';

const words = n => Array.from({ length: n }, (_, i) => `w${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + (i % 26))}x`.replace(/\d/g, ''));

test('questions are rewritten about each candidate', () => {
  assert.equal(aboutWord('Can your word mean a bird?', 'crane'), 'Can the word "crane" mean a bird?');
  assert.equal(aboutWord('Can your word be a describing word (an adjective)?', 'quick'), 'Can the word "quick" be a describing word (an adjective)?');
  assert.throws(() => aboutWord('Is it a bird?', 'crane'), /Can your word/);
});

test('requests carry the question and candidates only, at most 64 per request', () => {
  const [input] = clefInputs('@cf/cloudflare/clef-flash', ['crane', 'table'], 'Can your word mean a bird?');
  assert.equal(input.model, 'clef-flash');
  assert.deepEqual(Object.keys(input.questions), ['crane', 'table']);
  assert.deepEqual(input.questions.table, { type: 'noul', instructions: 'Can the word "table" mean a bird?' });
  const many = words(80);
  const inputs = clefInputs('@cf/cloudflare/clef', many, 'Can your word mean a bird?');
  assert.deepEqual(inputs.map(i => Object.keys(i.questions).length), [CLEF_MAX_QUESTIONS, 16]);
  assert.deepEqual(inputs.flatMap(i => Object.keys(i.questions)), many);
  assert.equal(clefInputs('@cf/cloudflare/clef', words(64), 'Can your word mean a bird?').length, 1);
  assert.throws(() => clefInputs('@cf/meta/llama-3.3-70b-instruct-fp8-fast', ['crane'], 'Can your word mean a bird?'), /Clef/);
  assert.throws(() => clefInputs('@cf/cloudflare/clef', ['Crane'], 'Can your word mean a bird?'), /lowercase/);
});

test('replies become probabilities; a missing or malformed answer fails the whole reply', () => {
  const raw = { answers: { crane: { type: 'noul', noul: 0.98 }, table: { type: 'noul', noul: 0.0127 } }, usage: { input_tokens: 249, output_tokens: 0 } };
  assert.deepEqual(clefProbabilities(raw, ['crane', 'table']), { crane: 0.98, table: 0.0127 });
  assert.equal(clefProbabilities(raw, ['crane', 'table', 'robin']), null);
  assert.equal(clefProbabilities({ answers: { crane: { noul: 1.5 } } }, ['crane']), null);
  assert.equal(clefProbabilities({ answers: { crane: { noul: '0.9' } } }, ['crane']), null);
  assert.equal(clefProbabilities({}, ['crane']), null);
  assert.deepEqual(clefUsage(raw), { prompt_tokens: 249, completion_tokens: 0 });
  assert.equal(clefUsage({}), null);
});

test('sorting splits at the threshold, keeping candidate order', () => {
  const p = { crane: 0.98, eagle: 0.5, table: 0.0127, robin: 0.49 };
  assert.deepEqual(clefSort(p, ['crane', 'eagle', 'robin', 'table']), { yes: ['crane', 'eagle'], no: ['robin', 'table'], yesShare: 0.5 });
  assert.deepEqual(clefSort(p, ['crane', 'eagle', 'robin', 'table'], 0.9).yes, ['crane']);
});

test('the reservation covers the measured Clef input tokens, where bytes alone fall short', () => {
  // Measured 2026-10-03: 894 input tokens for 9 candidates, 3,294 for 36.
  for (const [n, measured] of [[9, 894], [36, 3294]]) {
    const [input] = clefInputs('@cf/cloudflare/clef', words(n), 'Can your word mean a man-made object?');
    assert.ok(clefReserveTokens(input) > measured, `${n}: ${clefReserveTokens(input)} <= ${measured}`);
  }
  // Measured 91–99 tokens per candidate; the reservation must not depend on the request bytes alone.
  const [input] = clefInputs('@cf/cloudflare/clef', words(36), 'Can your word mean a man-made object?');
  assert.ok(clefReserveTokens(input) - Buffer.byteLength(JSON.stringify(input)) - 256 >= 36 * 120);
});
