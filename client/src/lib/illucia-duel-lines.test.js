import assert from 'node:assert/strict';
import test from 'node:test';
import { REPLIES, article, askLine, reasonLine, replyLine, solvedLine } from './illucia/duel-lines.js';

test('letters take "an" when their English name starts with a vowel sound', () => {
  assert.deepEqual([...'aefhilmnorsx'].map(article), Array(12).fill('an'));
  assert.deepEqual([...'bcdgjkpqtuvwyz'].map(article), Array(14).fill('a'));
  assert.equal(askLine('s', 0), 'Is there an S?');
  assert.equal(askLine('t', 0), 'Is there a T?');
});

test('she reacts to the hit she just saw, in words, then asks', () => {
  assert.equal(askLine('e', 1), 'E?');
  assert.equal(askLine('e', 1, { positions: 1 }), 'There it is. E?');
  assert.equal(askLine('e', 1, { positions: 3 }), 'Three at once. Efficient. E?');
  assert.equal(askLine('e', 2, { positions: 2 }), 'Two of them. Ooh. Let me try E.');
  assert.equal(askLine('e', 2, { positions: 12 }), '12 of them. Ooh. Let me try E.');
  assert.equal(askLine('e', 2, { positions: 2, single: true }), 'One word left in my notes. Let me try E.');
});

test('her reasoning is singular with one word left and names the tier on fallback', () => {
  assert.equal(reasonLine({ letter: 'e', share: 66, candidates: 11200, fallback: false }),
    'E is in 66% of the 11,200 words I still have in mind.');
  assert.equal(reasonLine({ letter: 'm', share: 100, candidates: 1, fallback: false }),
    'Only one word is left in my notes, and it has an M.');
  assert.equal(reasonLine({ letter: 's', share: 46, candidates: 0, fallback: true, tierLabel: 'Apprentice', length: 6 }),
    'None of my Apprentice words fit. S is in 46% of my 6-letter words.');
});

test('her answer depends on the reply, counts her chances, and concedes at six misses', () => {
  assert.deepEqual(REPLIES.map(reply => reply.text), ['Oops, wrong', "That wasn't so smart ;)"]);
  const base = { letter: 'b', turn: 1, count: 40, share: 30, length: 7 };
  const oops = replyLine('oops', { ...base, missesLeft: 5 });
  const smart = replyLine('smart', { ...base, missesLeft: 5 });
  assert.equal(oops, 'Fair enough. That rules out B.');
  assert.equal(smart, 'B was in 30% of my words. I stand by it.');
  assert.match(replyLine('oops', { ...base, missesLeft: 3 }), / Half my chances gone\.$/);
  assert.match(replyLine('smart', { ...base, missesLeft: 1 }), / One chance left\.$/);
  assert.equal(replyLine('oops', { ...base, missesLeft: 0 }), 'That was my last chance. You win, fair and square.');
  assert.equal(replyLine('smart', { ...base, missesLeft: 0 }), 'Six misses. Say it, then. You outsmarted me.');
});

test('she never counts words she no longer has, and says "word" for one', () => {
  const counting = { letter: 'd', turn: 3, share: 32, length: 6, missesLeft: 2 };
  // Positive control: turn 3 is the line that counts words.
  assert.equal(replyLine('oops', { ...counting, count: 1 }), 'Thank you. 1 word left without D.');
  assert.equal(replyLine('oops', { ...counting, count: 12 }), 'Thank you. 12 words left without D.');
  assert.equal(replyLine('oops', { ...counting, count: 0 }), 'Noted. D is out.');
});

test('the word appears only in the solved line, filled in by code', () => {
  assert.equal(solvedLine('example', 7), 'EXAMPLE! Solved in 7 guesses.');
});
