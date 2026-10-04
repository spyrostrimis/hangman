import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, toCsv } from './read-illucia-ai-log.js';

const row = (fields) => ({ model_key: 'llama-3.3-70b-clef-flash', outcome: 'accepted', tier: 'master', invent_ms: 2000, sort_ms: 600,
  total_ms: 2700, candidate_count: 20, yes_share: 0.4, answer: null, word_side: null, invent_neurons: 30, sort_neurons: 50, ...fields });

test('the summary counts outcomes, answers and whether the sort matched the player', () => {
  const summary = summarize([
    row({ answer: 'yes', word_side: 'yes' }),
    row({ answer: 'no', word_side: 'yes' }),
    row({ answer: 'declined', word_side: 'no' }),
    row({ outcome: 'sort-uneven', yes_share: null }),
    row({ model_key: 'llama-3.3-70b', outcome: 'timeout', sort_ms: null }),
  ])['llama-3.3-70b-clef-flash'];
  assert.equal(summary.attempts, 4);
  assert.deepEqual(summary.outcomes, { accepted: 3, 'sort-uneven': 1 });
  assert.equal(summary.acceptedRate, 0.75);
  assert.deepEqual(summary.answers, { yes: 1, no: 1, declined: 1 });
  // Declined answers say nothing about the sort; one of the two yes/no answers matched.
  assert.equal(summary.sortMatchesPlayer, '1/2');
  assert.equal(summary.neurons, 320);
  assert.deepEqual(summary.medianMs, { invent: 2000, sort: 600, total: 2700 });
});

test('CSV quotes cells that need it', () => {
  assert.equal(toCsv([{ a: 'x', b: 'Can your word mean "a, b"?', c: null }]), 'a,b,c\nx,"Can your word mean ""a, b""?",\n');
  assert.equal(toCsv([]), '');
});
