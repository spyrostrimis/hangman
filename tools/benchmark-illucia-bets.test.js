import assert from 'node:assert/strict';
import test from 'node:test';
import { simulate } from './benchmark-illucia.js';
import { ANSWER_RULES, ARMS, MULTIPLIERS, PREVIOUS_MULTIPLIERS, askStats, hindsight, loadQuestions, paired, play, pricing,
  versus } from './benchmark-illucia-bets.js';
import { createKnowledge } from '../client/src/lib/illucia/lexicon.js';
import { parseCategories, parseLabels } from '../client/src/lib/illucia/questions.js';

const CATEGORIES = parseCategories({ categories: [
  { code: 'c', key: 'bird', kind: 'noun', question: 'Can your word mean a bird?' },
  { code: 'o', key: 'artifact', kind: 'noun', question: 'Can your word mean a man-made object?' },
  { code: 'F', key: 'move', kind: 'verb', question: 'Can your word mean a way of moving?' },
  { code: 'b', key: 'animal', kind: 'noun', question: 'Can your word mean an animal?' },
] });
// wren is unknown to WordNet; every other word is labelled.
const LABELS = parseLabels('bolt o\ncrow cb\nhawk cb\nmole b\nnail o\nrake oF\nsing -\n', 4, CATEGORIES);
const KNOWLEDGE = createKnowledge(['bolt', 'crow', 'hawk', 'mole', 'nail', 'rake', 'sing', 'wren']
  .map(word => Object.freeze({ word, size: 35 })), 70);
const arm = id => ARMS.find(value => value.id === id);

test('eleven arms: decline, answer one or both per timing and category set, and two selective players', () => {
  assert.deepEqual(ARMS.map(value => value.id), ['decline',
    'first-noun-1', 'first-noun-2', 'first-all-1', 'first-all-2',
    'third-noun-1', 'third-noun-2', 'third-all-1', 'third-all-2', 'third-noun-long', 'third-noun-early']);
  assert.deepEqual([...MULTIPLIERS], [1, 1.5, 2]);
  assert.deepEqual([...PREVIOUS_MULTIPLIERS], [1, 1.25, 1.5]);
  assert.equal(arm('third-noun-2').earliestTurn, 2);
  assert.deepEqual(arm('first-all-1').kinds, ['noun', 'verb', 'adjective']);
});

test('declining every question is exactly today\'s play; answering changes it', () => {
  let changed = 0;
  for (const word of KNOWLEDGE.words) {
    const declined = play(word, KNOWLEDGE, LABELS, CATEGORIES, arm('decline'));
    assert.equal(declined.guesses, simulate(word, KNOWLEDGE, 'count', () => 0).guesses);
    assert.deepEqual(declined.asked, []);
    const answered = play(word, KNOWLEDGE, LABELS, CATEGORIES, arm('first-all-2'));
    if (answered.guesses !== declined.guesses) changed++;
  }
  assert.ok(changed > 0);  // positive control: the answer arm is not a copy of the decline arm
});

test('the honest player answers with the true label, declines unknown words and the extra question', () => {
  const crow = play('crow', KNOWLEDGE, LABELS, CATEGORIES, arm('first-noun-2'));
  assert.ok(crow.asked.length >= 1);
  for (const offer of crow.asked) {
    const code = CATEGORIES.find(category => category.key === offer.key).code;
    assert.equal(offer.answer, LABELS.get('crow').includes(code) ? 'yes' : 'no');
  }
  const wren = play('wren', KNOWLEDGE, LABELS, CATEGORIES, arm('first-noun-2'));
  assert.ok(wren.asked.length >= 1 && wren.asked.every(offer => offer.answer === 'declined'));
  assert.equal(wren.answered, 0);
  // Answer-one arms decline the second question; the answer-both arm answers it.
  const labelled = KNOWLEDGE.words.filter(word => LABELS.has(word));
  const one = labelled.map(word => play(word, KNOWLEDGE, LABELS, CATEGORIES, arm('first-all-1')));
  const both = labelled.map(word => play(word, KNOWLEDGE, LABELS, CATEGORIES, arm('first-all-2')));
  assert.ok(one.some(round => round.asked.length === 2));
  assert.ok(one.every(round => round.answered === Math.min(1, round.asked.length) &&
    round.asked.slice(1).every(offer => offer.answer === 'declined')));
  assert.ok(both.some(round => round.answered === 2));  // positive control
  // Not before her third guess under the default timing; at the first chance otherwise.
  const third = KNOWLEDGE.words.flatMap(word => play(word, KNOWLEDGE, LABELS, CATEGORIES, arm('third-all-2')).asked);
  assert.ok(third.length && third.every(offer => offer.turn >= 2));
  assert.equal(crow.asked[0].turn, 0);
});

const game = (word, won, misses, extra = {}) => ({ word, won, misses, inVocabulary: true, labelled: true,
  asked: [], answered: 0, ...extra });

test('paired comparison counts the words only one arm wins, with an exact two-sided test', () => {
  const declined = [game('aaaa', false, 6), game('bbbb', true, 3), game('cccc', true, 2), game('dddd', false, 6)];
  const answered = [game('aaaa', true, 5), game('bbbb', true, 1), game('cccc', true, 2), game('dddd', true, 4)];
  const result = paired(declined, answered);
  assert.equal(result.armOnly, 2);
  assert.equal(result.declineOnly, 0);
  assert.equal(result.difference, 0.5);
  assert.equal(result.p, 0.5);  // 2 of 2 discordant words: 2 x 1/4
  assert.equal(result.missesSaved, 1.25);  // (1 + 2 + 0 + 2) / 4
  assert.equal(paired(declined, declined).p, 1);  // control: identical arms
  assert.throws(() => paired(declined, [...answered].reverse()), /order/);
});

test('versus names both arms and keeps the paired counts', () => {
  const first = [game('aaaa', false, 6), game('bbbb', true, 2)];
  const third = [game('aaaa', true, 5), game('bbbb', true, 2)];
  assert.deepEqual(versus(first, third, ['first', 'third']), { words: 2, first: 0.5, third: 1, difference: 0.5,
    thirdOnly: 1, firstOnly: 0, p: 1, missesSaved: 0.5 });
});

test('pricing compares stump points over in-tier rounds WordNet knows, multiplied by answers', () => {
  // She loses "aaaaaa" (6 letters, 3 points) in both arms after two answers; she wins
  // "bbbb" (4 letters, 1 point) only when the player answers once.
  const declined = [game('aaaaaa', false, 6), game('bbbb', false, 6),
    game('cccc', false, 6, { labelled: false }), game('dddd', false, 6, { inVocabulary: false })];
  const answered = [game('aaaaaa', false, 6, { answered: 2 }), game('bbbb', true, 4, { answered: 1 }),
    game('cccc', true, 1), game('dddd', true, 1)];
  const result = pricing(declined, answered);
  assert.equal(result.rounds, 2);           // the unknown and the out-of-tier words are excluded
  assert.equal(result.roundsAnswered, 2);
  assert.equal(result.pointsRatio, 1.5);  // (3 x 2) / (3 + 1)
  assert.equal(pricing(declined, answered, 1, PREVIOUS_MULTIPLIERS).pointsRatio, 1.125);  // (3 x 1.5) / (3 + 1)
  assert.equal(result.breakEvenMultiplier, 1.3333);  // (3 + 1) / 3
  assert.equal(result.averageMultiplierWhenAnswered, (MULTIPLIERS[2] + MULTIPLIERS[1]) / 2);
  assert.equal(pricing(declined, declined).pointsRatio, 1);  // control: declining vs declining
});

test('selective players answer only by their rule; the hindsight bound takes the best per round', () => {
  // Long words only: every fixture word has 4 letters, so nothing is answered...
  const long = KNOWLEDGE.words.map(word => play(word, KNOWLEDGE, LABELS, CATEGORIES, { ...arm('third-noun-long'), earliestTurn: 0 }));
  assert.ok(long.some(round => round.asked.length) && long.every(round => round.answered === 0));
  // ...while the same arm with every rule passing answers (positive control).
  const anyRule = KNOWLEDGE.words.map(word => play(word, KNOWLEDGE, LABELS, CATEGORIES,
    { ...arm('third-noun-2'), earliestTurn: 0 }));
  assert.ok(anyRule.some(round => round.answered > 0));
  // Early: only offers made with at most one position revealed are answered.
  const early = KNOWLEDGE.words.map(word => play(word, KNOWLEDGE, LABELS, CATEGORIES, { ...arm('third-noun-early'), earliestTurn: 0 }));
  const offers = early.flatMap(round => round.asked);
  assert.ok(offers.some(offer => offer.answer !== 'declined'));
  assert.ok(offers.every(offer => offer.answer === 'declined' || offer.revealed <= 1));
  assert.equal(ANSWER_RULES.long('kitchen'), true);
  assert.equal(ANSWER_RULES.long('kitten'), false);
  // Hindsight: per round, the best of declining, one answer and two answers.
  const declined = [game('aaaaaa', false, 6), game('bbbb', true, 2), game('cccc', false, 6)];
  const one = [game('aaaaaa', false, 6, { answered: 1 }), game('bbbb', false, 6, { answered: 1 }), game('cccc', true, 3, { answered: 1 })];
  const both = [game('aaaaaa', false, 6, { answered: 2 }), game('bbbb', true, 1, { answered: 2 }), game('cccc', true, 2, { answered: 2 })];
  // Declining earns 3 + 0 + 1 = 4; the best per round earns 3 x 2 + 1 x 1.5 + 1 = 8.5.
  assert.deepEqual(hindsight(declined, [one, both]), { rounds: 3, pointsRatio: 2.125 });
  assert.deepEqual(hindsight(declined, []), { rounds: 3, pointsRatio: 1 });  // control: nothing to choose
});

test('ask statistics: share asked, first turn, and broad (whole lexicographer file) openers', () => {
  const games = [game('aaaa', true, 1, { asked: [{ key: 'artifact', turn: 2, candidates: 9, answer: 'no' },
    { key: 'person', turn: 4, candidates: 3, answer: 'yes' }] }),
    game('bbbb', true, 1, { asked: [{ key: 'bird', turn: 3, candidates: 5, answer: 'declined' }], labelled: false }),
    game('cccc', true, 1)];
  const stats = askStats(games, new Set(['artifact', 'person']));
  assert.equal(stats.roundsAsked, 2);
  assert.equal(stats.roundsAskedTwice, 1);
  assert.equal(stats.answered, 2);
  assert.equal(stats.declinedUnknownWord, 1);
  assert.deepEqual(stats.firstQuestionTurn, { 2: 1, 3: 1 });
  assert.equal(stats.medianCandidatesAtFirstQuestion, 5);
  assert.equal(stats.broadFirstShare, 0.5);
  assert.equal(stats.broadFirstShare, 0.5);  // openers only: the later person question doesn't count
  assert.deepEqual(stats.categories, { artifact: 1, bird: 1, person: 1 });
});

test('the published labels load with their checksums, and broad means a whole lexicographer file', async () => {
  const { categories, labelsByLength, broad } = await loadQuestions();
  assert.equal(categories.length, 41);
  assert.deepEqual(Object.keys(labelsByLength).map(Number), [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  assert.ok(broad.has('artifact') && broad.has('person') && broad.has('describe'));
  assert.ok(!broad.has('bird') && !broad.has('fruit'));
});
