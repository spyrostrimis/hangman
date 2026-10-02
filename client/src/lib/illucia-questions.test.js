import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRound, applyGuess, getRoundStatus } from './hangman-core.js';
import { toPublicState } from './illucia/public-state.js';
import { filterCandidates } from './illucia/candidates.js';
import { createKnowledge } from './illucia/lexicon.js';
import { analyzeDecision } from './illucia/strategy.js';
import { chooseQuestion, checkAnswer, narrowKnowledge, parseCategories, parseLabels } from './illucia/questions.js';

const roundAfter = (answer, guesses = '') => [...guesses].reduce(applyGuess, createRound(answer));
const CATEGORIES = parseCategories({ categories: [
  { code: 'c', key: 'bird', kind: 'noun', question: 'Can your word mean a bird?' },
  { code: 'o', key: 'artifact', kind: 'noun', question: 'Can your word mean a man-made object?' },
  { code: 'F', key: 'move', kind: 'verb', question: 'Can your word mean a way of moving?' },
  { code: 'b', key: 'animal', kind: 'noun', question: 'Can your word mean an animal?' },
] });
// Eight equally common words. wren is unknown to WordNet; sing is known with no category.
// Weights of 10 each: total 80, labelled 70.
const LABEL_TEXT = 'bolt o\ncrow cb\nhawk cb\nmole b\nnail o\nrake oF\nsing -\n';
const LABELS = parseLabels(LABEL_TEXT, 4, CATEGORIES);
const ENTRIES = ['bolt', 'crow', 'hawk', 'mole', 'nail', 'rake', 'sing', 'wren']
  .map(word => Object.freeze({ word, size: 35 }));
const KNOWLEDGE = createKnowledge(ENTRIES, 70);
// q and z are in none of the words: two misses that leave every word a candidate.
const AFTER_TWO = toPublicState(roundAfter('bolt', 'qz'));

test('labels: "-" is known with no category, absent is unknown, and bad files are rejected', () => {
  assert.equal(LABELS.get('sing'), '');
  assert.equal(LABELS.get('wren'), undefined);
  assert.equal(checkAnswer(LABELS, 'crow', 'c'), 'yes');
  assert.equal(checkAnswer(LABELS, 'sing', 'c'), 'no');
  assert.equal(checkAnswer(LABELS, 'wren', 'c'), null);
  for (const bad of ['crow cb\nbolt o\n', 'crows c\n', 'crow x\n', 'crow bc\n', 'crow c', 'crow \n']) {
    assert.throws(() => parseLabels(bad, 4, CATEGORIES));
  }
  assert.equal(parseLabels('', 4, CATEGORIES).size, 0);
  for (const bad of [{ categories: [] }, { categories: [CATEGORIES[0], CATEGORIES[0]] },
    { categories: [{ ...CATEGORIES[0], kind: 'adverb' }] }, { categories: [{ ...CATEGORIES[0], code: '1' }] }]) {
    assert.throws(() => parseCategories(bad));
  }
});

test('she asks the question whose worse answer rules out the most weight', () => {
  // animal 30/40 and artifact 30/40 tie on their worst case (30); bird is 20/50.
  // The tie goes to category order, so artifact (listed before animal) wins.
  const question = chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, []);
  assert.deepEqual({ ...question }, { code: 'o', key: 'artifact', kind: 'noun',
    question: 'Can your word mean a man-made object?', yesWeight: 30, noWeight: 40,
    unknownWeight: 10, totalWeight: 80, candidateCount: 8 });
  const reordered = [CATEGORIES[3], ...CATEGORIES.slice(0, 3)];
  assert.equal(chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, reordered, []).code, 'b');
});

test('each side must hold a quarter of all candidate weight, unknown words included', () => {
  const offers = [{ code: 'o', answer: 'declined' }, { code: 'b', answer: 'declined' }];
  // Bird: 20 of 80 is exactly a quarter, so it still qualifies...
  assert.equal(chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, offers, { maxQuestions: 3 }).code, 'c');
  // ...but not when a little more is required.
  assert.equal(chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, offers, { maxQuestions: 3, minShare: 0.26 }), null);
  // Unknown words count in the total: if most words are unknown, no question can split them.
  const sparse = parseLabels('bolt o\ncrow c\n', 4, CATEGORIES);
  assert.equal(chooseQuestion(AFTER_TWO, KNOWLEDGE, sparse, CATEGORIES, []), null);
  // Positive control: the same two labels split a two-word board evenly.
  const pair = createKnowledge(ENTRIES.filter(entry => entry.word === 'bolt' || entry.word === 'crow'), 70);
  assert.equal(chooseQuestion(AFTER_TWO, pair, sparse, CATEGORIES, []).code, 'c');
});

test('noun categories only, unless asked for more kinds', () => {
  const offers = [{ code: 'o', answer: 'declined' }, { code: 'b', answer: 'declined' }, { code: 'c', answer: 'declined' }];
  const options = { maxQuestions: 4, minShare: 0.1 };
  assert.equal(chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, offers, options), null);
  assert.equal(chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, offers,
    { ...options, kinds: ['noun', 'verb'] }).code, 'F');
});

test('not before her third guess by default, at most two offers, and declines count', () => {
  const afterOne = toPublicState(roundAfter('bolt', 'q'));
  const blank = toPublicState(createRound('bolt'));
  assert.equal(chooseQuestion(afterOne, KNOWLEDGE, LABELS, CATEGORIES, []), null);
  assert.equal(chooseQuestion(blank, KNOWLEDGE, LABELS, CATEGORIES, []), null);
  assert.equal(chooseQuestion(blank, KNOWLEDGE, LABELS, CATEGORIES, [], { earliestTurn: 0 }).code, 'o');
  assert.equal(chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, []).code, 'o');
  const two = [{ code: 'o', answer: 'declined' }, { code: 'b', answer: 'declined' }];
  assert.equal(chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, two), null);
  assert.equal(chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, two.slice(0, 1)).code, 'b');
  // A category already offered is never offered again, nor are malformed histories accepted.
  assert.throws(() => chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, [two[0], two[0]], { maxQuestions: 3 }));
  assert.throws(() => chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, [{ code: 'o', answer: 'maybe' }]));
});

test('answers narrow her vocabulary; unknown words stay on both sides; declines change nothing', () => {
  const words = offers => [...narrowKnowledge(KNOWLEDGE, LABELS, offers, CATEGORIES).words];
  assert.deepEqual(words([{ code: 'o', answer: 'yes' }]), ['bolt', 'nail', 'rake', 'wren']);
  assert.deepEqual(words([{ code: 'o', answer: 'no' }]), ['crow', 'hawk', 'mole', 'sing', 'wren']);
  assert.deepEqual(words([{ code: 'o', answer: 'no' }, { code: 'c', answer: 'yes' }]), ['crow', 'hawk', 'wren']);
  assert.equal(narrowKnowledge(KNOWLEDGE, LABELS, [{ code: 'o', answer: 'declined' }], CATEGORIES), KNOWLEDGE);
  // The narrowed vocabulary keeps the knowledge shape the letter choice reads.
  const narrowed = narrowKnowledge(KNOWLEDGE, LABELS, [{ code: 'o', answer: 'yes' }], CATEGORIES);
  assert.equal(narrowed.weights, KNOWLEDGE.weights);
  assert.equal(narrowed.maxSize, 70);
  assert.ok(Object.isFrozen(narrowed));
});

test('honest answers never remove the secret, so Master never runs out of candidates', () => {
  let questions = 0;
  for (const { word: secret } of ENTRIES) {
    let round = createRound(secret);
    const offers = [];
    while (getRoundStatus(round) === 'playing') {
      const state = toPublicState(round);
      const question = chooseQuestion(state, KNOWLEDGE, LABELS, CATEGORIES, offers, { earliestTurn: 0 });
      if (question) {
        offers.push({ code: question.code, answer: checkAnswer(LABELS, secret, question.code) ?? 'declined' });
        questions++;
      }
      const knowledge = narrowKnowledge(KNOWLEDGE, LABELS, offers, CATEGORIES);
      assert.ok(filterCandidates(state, knowledge.words).includes(secret));
      round = applyGuess(round, analyzeDecision(state, knowledge, 'count').letter);
    }
  }
  assert.ok(questions >= ENTRIES.length);
  // Positive control: a false answer about a labelled secret does remove it.
  const lie = narrowKnowledge(KNOWLEDGE, LABELS, [{ code: 'o', answer: 'no' }], CATEGORIES);
  assert.ok(!lie.words.includes('bolt'));
});

test('her question depends on the public board and history, never on the secret', () => {
  // bolt and crow give the same public state after two misses.
  const forBolt = chooseQuestion(toPublicState(roundAfter('bolt', 'qz')), KNOWLEDGE, LABELS, CATEGORIES, []);
  const forCrow = chooseQuestion(toPublicState(roundAfter('crow', 'qz')), KNOWLEDGE, LABELS, CATEGORIES, []);
  assert.deepEqual(forBolt, forCrow);
  // Positive control: a different public history changes the question.
  const after = chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, [{ code: 'o', answer: 'no' }]);
  assert.notEqual(after.code, forBolt.code);
  // Only a public snapshot is accepted, never the private round.
  assert.throws(() => chooseQuestion(roundAfter('bolt', 'qz'), KNOWLEDGE, LABELS, CATEGORIES, []), /toPublicState/);
});

test('the published label files parse against the published categories', () => {
  const read = path => readFileSync(new URL(`../../public/illucia/labels/${path}`, import.meta.url), 'utf8');
  const categories = parseCategories(JSON.parse(read('categories.json')));
  assert.equal(categories.length, 41);
  const labels = {};
  for (let length = 4; length <= 15; length++) labels[length] = parseLabels(read(`${length}.txt`), length, categories);
  const code = key => categories.find(category => category.key === key).code;
  assert.equal(checkAnswer(labels[5], 'crane', code('bird')), 'yes');
  assert.equal(checkAnswer(labels[4], 'bats', code('bird')), 'no');
  assert.equal(checkAnswer(labels[4], 'bats', code('mammal')), 'yes');
  assert.equal(checkAnswer(labels[7], 'because', code('bird')), null);
});
