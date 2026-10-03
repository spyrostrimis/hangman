import assert from 'node:assert/strict';
import test from 'node:test';
import { notebookLine } from './illucia/observatory-lines.js';

// A decision record as strategy.js writes it (shares and chances in hundredths of a percent).
const record = (extra = {}) => ({ letter: 'e', mode: 'exploring', candidateCount: 1200, share: 4150, choseBest: true,
  best: ['e'], tiedWith: [], vowelBonus: 0, learnedCandidates: 0,
  shortlist: [{ letter: 'e', share: 4150, chance: 6000 }, { letter: 'a', share: 3800, chance: 4000 }], ...extra });
const opts = { tierLabel: 'Scholar', length: 5 };

test('her top pick, with her odds, and only the facts her record holds', () => {
  assert.equal(notebookLine(record(), opts),
    'Counting common words more, E covers 42% of the 1,200 words she still has in mind. It comes out on top. Her odds: E 60% · A 40%. So E is next.');
  // A shortlist of one has no odds to show.
  assert.ok(!notebookLine(record({ shortlist: [{ letter: 'e', share: 4150, chance: 10000 }] }), opts).includes('Her odds'));
});

test('ties, careful mode and a hunch are each said as they happened', () => {
  assert.match(notebookLine(record({ tiedWith: ['a', 'i'] }), opts), /E, A and I are tied for her top pick; she has a feeling about E\./);
  assert.match(notebookLine(record({ tiedWith: ['a'] }), opts), /E and A are tied for her top pick/);
  assert.match(notebookLine(record({ mode: 'careful', tiedWith: ['a'] }), opts), /No more hunches: it is tied with A for her best letter\./);
  assert.ok(!notebookLine(record({ mode: 'careful' }), opts).includes('Her odds'));
  const hunch = notebookLine(record({ letter: 'a', choseBest: false, best: ['e', 'o'], vowelBonus: 400 }), opts);
  assert.match(hunch, /E and O score a little higher, but A is on her shortlist and she has a feeling about it\. Early on, she leans towards vowels\./);
  assert.ok(!hunch.includes('on top'));
});

test('one word left, a fallback, and words that beat her before', () => {
  assert.equal(notebookLine(record({ candidateCount: 1, letter: 'r' }), opts), 'Only one word is left in her notes, and it has an R. So R is next.');
  assert.equal(notebookLine({ letter: 't', fallback: true }, { ...opts, fallbackShare: 37 }),
    'None of her Scholar words fit this pattern. She falls back on habit: T appears in 37% of her 5-letter words, so T is next.');
  assert.match(notebookLine(record({ learnedCandidates: 2 }), opts), /2 words you beat her with before still fit\./);
  assert.match(notebookLine(record({ learnedCandidates: 1 }), opts), /One word you beat her with before still fits\./);
});
