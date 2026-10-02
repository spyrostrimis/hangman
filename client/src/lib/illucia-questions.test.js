import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRound, applyGuess, getRoundStatus } from './hangman-core.js';
import { toPublicState } from './illucia/public-state.js';
import { filterCandidates } from './illucia/candidates.js';
import { createKnowledge } from './illucia/lexicon.js';
import { analyzeDecision } from './illucia/strategy.js';
import { randomStream, weightedIndex } from './illucia/random.js';
import { B2_RULES, QUESTION_RULES, chooseQuestion, checkAnswer, narrowKnowledge, parseCategories,
  parseLabels } from './illucia/questions.js';

const roundAfter = (answer, guesses = '') => [...guesses].reduce(applyGuess, createRound(answer));
// bird is a narrow "kind of" class; man-made object, animal and moving are broad (whole files).
const CATEGORIES = parseCategories({ categories: [
  { code: 'c', key: 'bird', kind: 'noun', question: 'Can your word mean a bird?', kindOf: { 'oewn-1-n': 'bird' } },
  { code: 'o', key: 'artifact', kind: 'noun', question: 'Can your word mean a man-made object?', lexfiles: ['noun.artifact'] },
  { code: 'F', key: 'move', kind: 'verb', question: 'Can your word mean a way of moving?', lexfiles: ['verb.motion'] },
  { code: 'b', key: 'animal', kind: 'noun', question: 'Can your word mean an animal?', lexfiles: ['noun.animal'] },
] });
// Eight equally common words. wren is unknown to WordNet; sing is known with no category.
// Weights of 10 each: total 80, labelled 70.
const LABEL_TEXT = 'bolt o\ncrow cb\nhawk cb\nmole b\nnail o\nrake oF\nsing -\n';
const LABELS = parseLabels(LABEL_TEXT, 4, CATEGORIES);
const ENTRIES = ['bolt', 'crow', 'hawk', 'mole', 'nail', 'rake', 'sing', 'wren']
  .map(word => Object.freeze({ word, size: 35 }));
const KNOWLEDGE = createKnowledge(ENTRIES, 70);
// q, z, j and v are in none of the words: misses that leave every word a candidate.
const AFTER_TWO = toPublicState(roundAfter('bolt', 'qz'));     // 4 misses left
const AFTER_FOUR = toPublicState(roundAfter('bolt', 'qzjv'));  // 2 misses left

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
  const spec = { code: 'c', key: 'bird', kind: 'noun', question: 'q', kindOf: { x: 'bird' } };
  for (const bad of [[], [spec, spec], [{ ...spec, kind: 'adverb' }], [{ ...spec, code: '1' }],
    [{ ...spec, kindOf: undefined }], [{ ...spec, lexfiles: ['noun.animal'] }]]) {
    assert.throws(() => parseCategories({ categories: bad }));
  }
  assert.deepEqual(CATEGORIES.map(category => category.broad), [false, true, true, true]);
});

// ---- B2's first rules (25% for every category, no holding, strictly the best) ----

test('B2 rules: she asks the question whose worse answer rules out the most weight', () => {
  // animal 30/40 and artifact 30/40 tie on their worst case (30); bird is 20/50.
  // The tie goes to category order, so artifact (listed before animal) wins.
  const question = chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, [], B2_RULES);
  assert.deepEqual([question.code, question.yesWeight, question.noWeight, question.unknownWeight,
    question.totalWeight, question.candidateCount, question.share, question.tag], ['o', 30, 40, 10, 80, 8, 3750, 'early-broad']);
  const reordered = [CATEGORIES[3], ...CATEGORIES.slice(0, 3)];
  assert.equal(chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, reordered, [], B2_RULES).code, 'b');
});

test('B2 rules: each side must hold a quarter of all candidate weight, unknown words included', () => {
  const offers = [{ code: 'o', answer: 'declined' }, { code: 'b', answer: 'declined' }];
  // Bird: 20 of 80 is exactly a quarter, so it still qualifies...
  assert.equal(chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, offers, { ...B2_RULES, maxQuestions: 3 }).code, 'c');
  // ...but not when a little more is required.
  assert.equal(chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, offers,
    { ...B2_RULES, maxQuestions: 3, narrowFloor: 2600 }), null);
  // Unknown words count in the total: if most words are unknown, no question can split them.
  const sparse = parseLabels('bolt o\ncrow c\n', 4, CATEGORIES);
  assert.equal(chooseQuestion(AFTER_TWO, KNOWLEDGE, sparse, CATEGORIES, [], B2_RULES), null);
  // Positive control: the same two labels split a two-word board evenly.
  const pair = createKnowledge(ENTRIES.filter(entry => entry.word === 'bolt' || entry.word === 'crow'), 70);
  assert.equal(chooseQuestion(AFTER_TWO, pair, sparse, CATEGORIES, [], B2_RULES).code, 'c');
});

test('noun categories only, unless asked for more kinds', () => {
  const offers = [{ code: 'o', answer: 'declined' }, { code: 'b', answer: 'declined' }, { code: 'c', answer: 'declined' }];
  const options = { ...B2_RULES, maxQuestions: 4, broadFloor: 1000 };
  assert.equal(chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, offers, options), null);
  assert.equal(chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, offers,
    { ...options, kinds: ['noun', 'verb'] }).code, 'F');
});

test('not before her third guess by default, at most two offers, and declines count', () => {
  const afterOne = toPublicState(roundAfter('bolt', 'q'));
  const blank = toPublicState(createRound('bolt'));
  assert.equal(chooseQuestion(afterOne, KNOWLEDGE, LABELS, CATEGORIES, [], B2_RULES), null);
  assert.equal(chooseQuestion(blank, KNOWLEDGE, LABELS, CATEGORIES, [], B2_RULES), null);
  assert.equal(chooseQuestion(blank, KNOWLEDGE, LABELS, CATEGORIES, [], { ...B2_RULES, earliestTurn: 0 }).code, 'o');
  assert.equal(chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, [], B2_RULES).code, 'o');
  const two = [{ code: 'o', answer: 'declined' }, { code: 'b', answer: 'declined' }];
  assert.equal(chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, two, B2_RULES), null);
  assert.equal(chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, two.slice(0, 1), B2_RULES).code, 'b');
  // A category already offered is never offered again, nor are malformed histories accepted.
  assert.throws(() => chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, [two[0], two[0]], { maxQuestions: 3 }));
  assert.throws(() => chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, [{ code: 'o', answer: 'maybe' }]));
});

// ---- Her rules since 2026-10-03 (the defaults) ----

test('the default rules are the decided values', () => {
  assert.deepEqual({ ...QUESTION_RULES },
    { broadFloor: 2500, narrowFloor: 1000, holdBroadUntil: 2, narrowBonus: 1000, shortlist: 1000 });
});

test('broad questions wait until she has at most 2 misses left; narrow ones do not', () => {
  // With 4 misses left the broad questions are held, so the narrow bird question comes first.
  const early = chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, []);
  assert.deepEqual([early.code, early.broad, early.tag, early.missesLeft], ['c', false, 'early-narrow', 4]);
  // With 2 misses left a broad one may come: artifact's 37.5% beats bird's 25% + 10 bonus.
  const late = chooseQuestion(AFTER_FOUR, KNOWLEDGE, LABELS, CATEGORIES, []);
  assert.deepEqual([late.code, late.broad, late.tag, late.missesLeft], ['o', true, 'late-broad', 2]);
  // Positive control: without holding, the broad question comes first at 4 misses left too.
  assert.equal(chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, [], { holdBroadUntil: null }).code, 'o');
  // While broad ones are held and no narrow one qualifies, she asks nothing.
  const offers = [{ code: 'c', answer: 'declined' }];
  assert.equal(chooseQuestion(AFTER_TWO, KNOWLEDGE, LABELS, CATEGORIES, offers), null);
  assert.equal(chooseQuestion(AFTER_FOUR, KNOWLEDGE, LABELS, CATEGORIES, offers).code, 'o');
});

test('a narrow question needs a tenth of the weight on each side', () => {
  // Ten common words, one of them a bird: exactly 10% yes. Eleven: 9.1%, too little.
  const words = n => Array.from({ length: n }, (_, i) => 'ab' + 'cdefghijklm'[i] + 'n');
  const board = n => {
    const list = words(n);
    const knowledge = createKnowledge(list.map(word => ({ word, size: 35 })), 70);
    const labels = parseLabels(list.map((word, i) => `${word} ${i === 0 ? 'c' : '-'}\n`).join(''), 4, CATEGORIES);
    return chooseQuestion(toPublicState(roundAfter(list[0], 'qz')), knowledge, labels, CATEGORIES, []);
  };
  assert.equal(board(10).code, 'c');
  assert.equal(board(11), null);
});

test('the narrow bonus can tip the choice towards a narrow category', () => {
  // At 2 misses left: artifact 37.5%, bird 25% + bonus.
  assert.equal(chooseQuestion(AFTER_FOUR, KNOWLEDGE, LABELS, CATEGORIES, [], { narrowBonus: 1000 }).code, 'o');
  assert.equal(chooseQuestion(AFTER_FOUR, KNOWLEDGE, LABELS, CATEGORIES, [], { narrowBonus: 1500 }).code, 'c');
});

test('with a round seed she picks among questions within 10 points of her best, the same way every time', () => {
  // At 2 misses left: artifact 3750, animal 3750, bird 2500 + 1000 = 3500. Cut-off 2750:
  // all three are on the shortlist, with odds 1000 / 1000 / 750.
  const picks = new Map();
  for (let seed = 0; seed < 400; seed++) {
    const question = chooseQuestion(AFTER_FOUR, KNOWLEDGE, LABELS, CATEGORIES, [], { seed });
    assert.deepEqual(chooseQuestion(AFTER_FOUR, KNOWLEDGE, LABELS, CATEGORIES, [], { seed }), question);
    picks.set(question.code, (picks.get(question.code) ?? 0) + 1);
    assert.deepEqual(question.shortlist.map(entry => [entry.key, entry.chance]),
      [['animal', 3636], ['artifact', 3636], ['bird', 2727]]);
    assert.equal(question.choseBest, question.code !== 'c');
  }
  assert.deepEqual([...picks.keys()].sort(), ['b', 'c', 'o']);
  assert.ok(picks.get('c') < picks.get('o') && picks.get('c') < picks.get('b'));
  // Her question draw is salted: it is not the draw her letter uses on the same turn, which
  // would pick shortlist index weightedIndex(randomStream(seed, turn), odds) in category order.
  let same = 0;
  for (let seed = 0; seed < 400; seed++) {
    const letterDraw = ['c', 'o', 'b'][weightedIndex(randomStream(seed, 4), [750, 1000, 1000])];
    if (chooseQuestion(AFTER_FOUR, KNOWLEDGE, LABELS, CATEGORIES, [], { seed }).code === letterDraw) same++;
  }
  assert.ok(same > 50 && same < 350);  // agreement by chance only (about 4 in 10)
  // Positive controls: no seed, or no shortlist width, gives strictly the best (category order).
  assert.equal(chooseQuestion(AFTER_FOUR, KNOWLEDGE, LABELS, CATEGORIES, []).code, 'o');
  for (let seed = 0; seed < 50; seed++) {
    assert.equal(chooseQuestion(AFTER_FOUR, KNOWLEDGE, LABELS, CATEGORIES, [], { seed, shortlist: 0 }).code, 'o');
  }
});

// ---- Both rule sets ----

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
  for (const rules of [B2_RULES, {}]) {
    for (const { word: secret } of ENTRIES) {
      for (const seed of [1, 2, 3]) {
        let round = createRound(secret);
        const offers = [];
        while (getRoundStatus(round) === 'playing') {
          const state = toPublicState(round);
          const question = chooseQuestion(state, KNOWLEDGE, LABELS, CATEGORIES, offers, { ...rules, earliestTurn: 0, seed });
          if (question) {
            offers.push({ code: question.code, answer: checkAnswer(LABELS, secret, question.code) ?? 'declined' });
            questions++;
          }
          const knowledge = narrowKnowledge(KNOWLEDGE, LABELS, offers, CATEGORIES);
          assert.ok(filterCandidates(state, knowledge.words).includes(secret));
          round = applyGuess(round, analyzeDecision(state, knowledge, { seed }).letter);
        }
      }
    }
  }
  assert.ok(questions >= ENTRIES.length);
  // Positive control: a false answer about a labelled secret does remove it.
  const lie = narrowKnowledge(KNOWLEDGE, LABELS, [{ code: 'o', answer: 'no' }], CATEGORIES);
  assert.ok(!lie.words.includes('bolt'));
});

test('her question depends on the public board, history and seed, never on the secret', () => {
  for (const options of [B2_RULES, { seed: 7 }]) {
    // bolt and crow give the same public state after four misses.
    const forBolt = chooseQuestion(toPublicState(roundAfter('bolt', 'qzjv')), KNOWLEDGE, LABELS, CATEGORIES, [], options);
    const forCrow = chooseQuestion(toPublicState(roundAfter('crow', 'qzjv')), KNOWLEDGE, LABELS, CATEGORIES, [], options);
    assert.deepEqual(forBolt, forCrow);
    // Positive control: a different public history changes the question.
    const offers = [{ code: forBolt.code, answer: 'no' }];
    assert.notEqual(chooseQuestion(AFTER_FOUR, KNOWLEDGE, LABELS, CATEGORIES, offers, options)?.code, forBolt.code);
  }
  // Only a public snapshot is accepted, never the private round.
  assert.throws(() => chooseQuestion(roundAfter('bolt', 'qz'), KNOWLEDGE, LABELS, CATEGORIES, []), /toPublicState/);
});

test('the published label files parse against the published categories', () => {
  const read = path => readFileSync(new URL(`../../public/illucia/labels/${path}`, import.meta.url), 'utf8');
  const categories = parseCategories(JSON.parse(read('categories.json')));
  assert.equal(categories.length, 41);
  const broad = key => categories.find(category => category.key === key).broad;
  assert.ok(broad('artifact') && broad('person') && !broad('bird') && !broad('fruit'));
  const labels = {};
  for (let length = 4; length <= 15; length++) labels[length] = parseLabels(read(`${length}.txt`), length, categories);
  const code = key => categories.find(category => category.key === key).code;
  assert.equal(checkAnswer(labels[5], 'crane', code('bird')), 'yes');
  assert.equal(checkAnswer(labels[4], 'bats', code('bird')), 'no');
  assert.equal(checkAnswer(labels[4], 'bats', code('mammal')), 'yes');
  assert.equal(checkAnswer(labels[7], 'because', code('bird')), null);
});
