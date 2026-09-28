import assert from 'node:assert/strict';
import test from 'node:test';
import { createRound, applyGuess, getRoundStatus } from './hangman-core.js';
import { toPublicState } from './illucia/public-state.js';
import { filterCandidates } from './illucia/candidates.js';
import { parseLexicon, createKnowledge, isAcceptedWord } from './illucia/lexicon.js';
import { chooseLetter, analyzeDecision, partitionWords, POLICIES } from './illucia/strategy.js';

const roundAfter = (answer, guesses = '') => [...guesses].reduce(applyGuess, createRound(answer));
const knowledgeOf = words => createKnowledge(parseLexicon(
  [...words].sort().map(word => `${word} 35\n`).join(''), words[0].length));

test('public snapshots allow only public fields and cannot retain the private round', () => {
  const round = roundAfter('eagle', 'ex');
  round.privateNote = 'private';
  const state = toPublicState(round);
  assert.deepEqual(state, { length: 5, pattern: ['e', null, null, null, 'e'],
    guessedLetters: ['e', 'x'], missedLetters: ['x'], missesLeft: 5 });
  assert.equal(round.answer, 'eagle'); // Positive control: the source really has the secret.
  assert.equal(JSON.stringify(state).includes('eagle'), false);
  assert.equal('answer' in state, false);
  assert.equal('privateNote' in state, false);
  round.guesses.push('a');
  assert.deepEqual(state.guessedLetters, ['e', 'x']);
  assert.throws(() => state.pattern.push('a'), TypeError);
  const knowledge = knowledgeOf(['eagle', 'eerie']);
  assert.equal(chooseLetter(state, knowledge), 'a');
  assert.throws(() => chooseLetter(round, knowledge), /toPublicState/);
  assert.throws(() => chooseLetter({ ...state, answer: 'eagle' }, knowledge), /toPublicState/);
});

test('exact positions exclude extra copies of hits and all missed letters', () => {
  const state = toPublicState(roundAfter('eagle', 'ex'));
  assert.deepEqual(filterCandidates(state, ['eagle', 'eerie', 'exile', 'angle', 'cat']), ['eagle']);
  assert.deepEqual(filterCandidates(toPublicState(createRound('eagle')), ['eagle', 'eerie']), ['eagle', 'eerie']);
});

test('lexicon parsing rejects duplicate, malformed, unsorted and wrong-length assets', () => {
  const entries = parseLexicon('cat 35\ndog 70\n', 3);
  assert.equal(isAcceptedWord('dog', entries), true);
  assert.equal(isAcceptedWord('Dog', entries), false);
  assert.equal(isAcceptedWord('fox', entries), false);
  const low = createKnowledge(entries, 35);
  assert.deepEqual(low.words, ['cat']);
  assert.deepEqual(createKnowledge(entries).words, ['cat', 'dog']);
  for (const text of ['cat 35\ncat 50\n', 'dog 70\ncat 35\n', 'café 35\n', 'cats 35\n', 'cat 75\n', 'cat 35']) {
    assert.throws(() => parseLexicon(text, 3));
  }
  assert.throws(() => createKnowledge(entries, 60), /Unknown/);
});

test('count uses word presence, not letter occurrences, and alphabetic ties', () => {
  const knowledge = knowledgeOf(['aaa', 'bcd', 'bce']);
  const state = toPublicState(createRound('aaa'));
  assert.equal(chooseLetter(state, knowledge), 'b');
  assert.deepEqual(analyzeDecision(state, knowledge), { letter: 'b', candidateCount: 3, hitCount: 2 });
  assert.equal(chooseLetter(toPublicState(roundAfter('bcd', 'b')), knowledge), 'c');
});

test('frequency is fixed by vocabulary while count adapts to surviving candidates', () => {
  const knowledge = knowledgeOf(['aaa', 'aab', 'aac', 'bcd']);
  const state = toPublicState(roundAfter('bcd', 'c'));
  assert.equal(analyzeDecision(state, knowledge, 'frequency').letter, 'a');
  assert.equal(chooseLetter(state, knowledge), 'b');
});

test('entropy partitions repeated letters by their complete reveal mask', () => {
  assert.deepEqual([...partitionWords(['aba', 'baa', 'bbb'], 'a')],
    [[5, ['aba']], [6, ['baa']], [0, ['bbb']]]);
  const knowledge = knowledgeOf(['abb', 'bab', 'bba']);
  assert.equal(analyzeDecision(toPublicState(createRound('abb')), knowledge, 'entropy').letter, 'a');
});

test('all policies stop after a result and Master rejects impossible states', () => {
  const knowledge = knowledgeOf(['cat', 'dog']);
  for (const policy of POLICIES) {
    assert.match(analyzeDecision(toPublicState(createRound('cat')), knowledge, policy).letter, /^[a-z]$/);
    assert.equal(analyzeDecision(toPublicState(roundAfter('cat', 'cat')), knowledge, policy).letter, null);
    assert.equal(analyzeDecision(toPublicState(roundAfter('cat', 'befhij')), knowledge, policy).letter, null);
    assert.throws(() => analyzeDecision(toPublicState(roundAfter('fox', 'f')), knowledge, policy), /Master invariant/);
  }
  assert.throws(() => chooseLetter(toPublicState(createRound('eagle')), knowledge), /length mismatch/);
});

test('risk penalty and two-turn endgame lookahead affect benchmark choices', () => {
  const riskKnowledge = knowledgeOf(['edb', 'cda', 'dae', 'abd', 'bdc', 'aec']);
  const state = toPublicState(roundAfter('edb', 'wxyz'));
  assert.equal(analyzeDecision(state, riskKnowledge, 'entropy').letter, 'a');
  assert.equal(analyzeDecision(state, riskKnowledge, 'risk').letter, 'd');
  const endgame = knowledgeOf(['bea', 'bbb', 'aca', 'bcd', 'abe', 'ede']);
  const twoLeft = toPublicState(roundAfter('bea', 'wxyz'));
  // Starting with a can finish aca or bbb within two turns (2/6).
  // Starting with b can finish only bbb within that horizon (1/6).
  assert.equal(analyzeDecision(twoLeft, endgame, 'risk').letter, 'b');
  assert.equal(analyzeDecision(twoLeft, endgame, 'lookahead').letter, 'a');
  const threeLeft = toPublicState(roundAfter('bea', 'wxy'));
  assert.equal(analyzeDecision(threeLeft, endgame, 'lookahead').letter, 'b');
});

test('all policies use shared adjudication, never repeat, and preserve the answer as a candidate', () => {
  const words = ['abb', 'bab', 'bba', 'ccc', 'ddd', 'eee', 'fff', 'ggg'];
  const knowledge = knowledgeOf(words);
  let solved = 0;
  let failed = 0;
  for (const policy of POLICIES) for (const word of words) {
    let round = createRound(word);
    while (getRoundStatus(round) === 'playing') {
      const state = toPublicState(round);
      assert.ok(filterCandidates(state, knowledge.words).includes(word));
      const { letter } = analyzeDecision(state, knowledge, policy);
      assert.equal(round.guesses.includes(letter), false);
      const next = applyGuess(round, letter);
      assert.notEqual(next, round);
      round = next;
      assert.ok(round.guesses.length <= 26);
    }
    if (getRoundStatus(round) === 'solved') solved++; else failed++;
  }
  assert.ok(solved > 0);
  assert.ok(failed > 0);
});
