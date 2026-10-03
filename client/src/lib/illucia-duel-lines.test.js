import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { ANSWERS, REPLIES, answerLine, article, askLine, questionLine, questionNote, reasonLine, replyLine, solvedLine } from './illucia/duel-lines.js';
import { applyGuess, createRound } from './hangman-core.js';
import { toPublicState } from './illucia/public-state.js';
import { VOCABULARY_TIERS, createKnowledge, parseLexicon } from './illucia/lexicon.js';
import { analyzeDecision } from './illucia/strategy.js';

test('letters take "an" when their English name starts with a vowel sound', () => {
  assert.deepEqual([...'aefhilmnorsx'].map(article), Array(12).fill('an'));
  assert.deepEqual([...'bcdgjkpqtuvwyz'].map(article), Array(14).fill('a'));
  assert.equal(askLine('s', 0), 'Is there an S?');
  assert.equal(askLine('t', 0), 'Is there a T?');
});

test('she says she expected a hit only when most of her words had the letter', () => {
  // Turn 2 is the "As expected." reaction; positive control first.
  assert.equal(askLine('e', 2, { positions: 1, share: 70 }), 'As expected. Let me try E.');
  assert.equal(askLine('e', 2, { positions: 1, share: 50 }), 'As expected. Let me try E.');
  assert.equal(askLine('e', 2, { positions: 1, share: 49 }), 'A pleasant surprise. Let me try E.');
  assert.equal(askLine('e', 2, { positions: 1 }), 'A pleasant surprise. Let me try E.');
  // Other reactions make no claim and ignore the share.
  assert.equal(askLine('e', 1, { positions: 1, share: 10 }), 'There it is. E?');
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

test('her reasoning says why, from her decision record only', () => {
  const facts = 'T is in 40% of the 120 words I still have in mind.';
  const line = decision => reasonLine({ letter: 't', share: 40, candidates: 120, fallback: false, decision });
  // No record (a strict policy): the facts alone.
  assert.equal(line(null), facts);
  assert.equal(line({ mode: 'exploring', choseBest: true, best: ['t'], tiedWith: [], vowelBonus: 0 }), `${facts} It comes out on top.`);
  assert.equal(line({ mode: 'exploring', choseBest: true, best: ['t'], tiedWith: [], vowelBonus: 300 }),
    `${facts} It comes out on top, helped by my early lean towards vowels.`);
  assert.equal(line({ mode: 'exploring', choseBest: true, best: ['i', 't'], tiedWith: ['i'], vowelBonus: 0 }),
    `${facts} T and I are tied for my top pick; I have a feeling about T.`);
  assert.equal(line({ mode: 'exploring', choseBest: false, best: ['e'], tiedWith: [], vowelBonus: 0 }),
    `${facts} E scores a little higher, but T is on my shortlist and I have a feeling about it.`);
  assert.equal(line({ mode: 'exploring', choseBest: false, best: ['a', 'e', 'o'], tiedWith: [], vowelBonus: 200 }),
    `${facts} A, E and O score a little higher, but T is on my shortlist and I have a feeling about it. Early on, I lean towards vowels.`);
  assert.equal(line({ mode: 'careful', choseBest: true, best: ['t'], tiedWith: [], vowelBonus: 0 }), `${facts} No more hunches: it is my best letter.`);
  assert.equal(line({ mode: 'careful', choseBest: true, best: ['s', 't'], tiedWith: ['s'], vowelBonus: 0 }),
    `${facts} No more hunches: it is tied with S for my best letter, and I picked T.`);
});

test('every reasoning line matches what her real temperament did, at every tier', () => {
  const entries = parseLexicon(readFileSync(new URL('../../public/illucia/words/5.txt', import.meta.url), 'utf8'), 5);
  // Fresh board, an early hit, and a careful board (two misses left) on a common word.
  const boards = [createRound('crane'), ['e'].reduce(applyGuess, createRound('crane')),
    [...'uiosd'].reduce(applyGuess, createRound('crane'))];
  // A tiny fixture where A and B are in every word, so they always tie: ties are rare on the real list.
  const tied = parseLexicon('abcd 35\nabef 35\nabgh 35\n', 4);
  const cases = VOCABULARY_TIERS.flatMap(tier => [
    ...boards.map(round => [createKnowledge(entries, tier.maxSize), round]),
    [createKnowledge(tied, tier.maxSize), createRound('abcd')],
    [createKnowledge(tied, tier.maxSize), [...'uvwx'].reduce(applyGuess, createRound('abcd'))],
  ]);
  const seen = { top: 0, lean: 0, tie: 0, hunch: 0, careful: 0 };
  for (const [knowledge, round] of cases) {
    for (let seed = 0; seed < 150; seed++) {
      const decision = analyzeDecision(toPublicState(round), knowledge, { seed });
      const text = reasonLine({ letter: decision.letter, share: 0, candidates: decision.candidateCount, fallback: false, decision });
      const L = decision.letter.toUpperCase();
      if (decision.mode === 'careful') {
        seen.careful++;
        assert.equal(decision.choseBest, true);
        assert.match(text, /No more hunches/);
      } else {
        assert.doesNotMatch(text, /No more hunches/);
      }
      if (decision.choseBest) {
        assert.doesNotMatch(text, /a little higher/);
        if (decision.tiedWith.length) { seen.tie++; assert.match(text, /tied/); }
      } else {
        seen.hunch++;
        assert.equal(decision.mode, 'exploring');
        assert.match(text, /a little higher, but . is on my shortlist/);
        for (const letter of decision.best) assert.ok(text.includes(letter.toUpperCase()), text);
        assert.ok(decision.shortlist.some(option => option.letter === decision.letter));
        assert.ok(!decision.best.includes(decision.letter));
      }
      if (decision.mode === 'exploring' && decision.choseBest && !decision.tiedWith.length) {
        seen.top++;
        assert.match(text, /It comes out on top/);
      }
      assert.equal(/lean towards vowels/.test(text), decision.mode === 'exploring' && decision.vowelBonus > 0);
      if (decision.vowelBonus > 0) seen.lean++;
      assert.ok(text.startsWith(`${L} is in`), text);
    }
  }
  // Positive controls: each kind of line really occurred, so none of the checks above is vacuous.
  for (const [kind, count] of Object.entries(seen)) assert.ok(count > 0, `no ${kind} decisions`);
});

test('she calls a miss the smart move only when it was her best letter', () => {
  // Turn 4 is the first "smart" line.
  const base = { letter: 'b', turn: 4, count: 40, share: 30, length: 7, missesLeft: 5 };
  assert.equal(replyLine('smart', base), 'Statistically it was the smart move. Statistics can be rude.');
  assert.equal(replyLine('smart', { ...base, hunch: true }), 'It was a hunch. Hunches can be rude.');
  // Other lines are true either way.
  assert.equal(replyLine('smart', { ...base, turn: 1, hunch: true }), 'B was in 30% of my words. I stand by it.');
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

test('an early narrow question sounds curious, a late broad one desperate', () => {
  const bird = { question: 'Can your word mean a bird?', tag: 'early-narrow', missesLeft: 4, share: 3349 };
  const object = { question: 'Can your word mean a man-made object?', tag: 'late-broad', missesLeft: 2, share: 4100 };
  assert.equal(questionLine(bird, 2), 'Humour me. Can your word mean a bird?');
  assert.equal(questionLine(bird, 3), 'Something different. Can your word mean a bird?');
  assert.equal(questionLine(object, 3), 'Two chances left. Time for broad strokes. Can your word mean a man-made object?');
  assert.equal(questionLine({ ...object, missesLeft: 1 }, 3), 'One chance left. Time for broad strokes. Can your word mean a man-made object?');
  assert.equal(questionLine(object, 4), 'I am running out of chances. Desperate times: Can your word mean a man-made object?');
  for (let turn = 0; turn < 6; turn++) {
    assert.doesNotMatch(questionLine(bird, turn), /chance|Desperate|broad/);
    assert.match(questionLine(object, turn), /chance|Desperate|broad/);
  }
});

test('her question note is true of either answer and credits WordNet', () => {
  assert.equal(questionNote({ share: 3349 }),
    'Either answer rules out at least 33% of my words, counting common ones more. Categories: Open English WordNet (CC BY 4.0).');
});

test('her reply names the outcome; only a correction says the bonus is gone', () => {
  assert.deepEqual(ANSWERS.map(choice => [choice.id, choice.label]), [['yes', 'Yes, it can'], ['no', "No, it can't"], ['declined', 'Decline']]);
  assert.equal(answerLine('corrected', 0, 'yes'), 'My archive says otherwise: your word can mean that. I will go by the archive, so no bonus for that one.');
  assert.equal(answerLine('corrected', 0, 'no'), 'My archive says otherwise: your word cannot mean that. I will go by the archive, so no bonus for that one.');
  assert.equal(answerLine('unchecked', 1), 'My archive does not know your word, so I will take your word for it.');
  for (const outcome of ['confirmed', 'unchecked', 'declined']) {
    for (let turn = 0; turn < 3; turn++) assert.doesNotMatch(answerLine(outcome, turn), /bonus|otherwise/);
  }
});
