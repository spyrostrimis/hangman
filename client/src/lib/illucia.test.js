import assert from 'node:assert/strict';
import test from 'node:test';
import { createRound, applyGuess, getRoundStatus } from './hangman-core.js';
import { toPublicState } from './illucia/public-state.js';
import { filterCandidates } from './illucia/candidates.js';
import { MAX_WORD_LENGTH, MIN_WORD_LENGTH, parseLexicon, createKnowledge, isAcceptedWord, isWordShape } from './illucia/lexicon.js';
import { chooseLetter, analyzeDecision, partitionWords, POLICIES } from './illucia/strategy.js';

const roundAfter = (answer, guesses = '') => [...guesses].reduce(applyGuess, createRound(answer));
// Solver fixtures use tiny 3-letter words. They bypass the word-file parser,
// whose own contract (lengths 4-15) is tested separately.
const entriesOf = text => text.trim().split('\n').map(line => {
  const [word, size] = line.split(' ');
  return Object.freeze({ word, size: Number(size) });
});
const knowledgeOf = words => createKnowledge(entriesOf([...words].sort().map(word => `${word} 35`).join('\n')));

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
  const entries = parseLexicon('cats 35\ndogs 70\n', 4);
  assert.equal(isAcceptedWord('dogs', entries), true);
  assert.equal(isAcceptedWord('Dogs', entries), false);
  assert.equal(isAcceptedWord('foxy', entries), false);
  const low = createKnowledge(entries, 35);
  assert.deepEqual(low.words, ['cats']);
  assert.deepEqual(createKnowledge(entries).words, ['cats', 'dogs']);
  for (const text of ['cats 35\ncats 50\n', 'dogs 70\ncats 35\n', 'café 35\n', 'catss 35\n', 'cats 75\n', 'cats 35']) {
    assert.throws(() => parseLexicon(text, 4));
  }
  assert.throws(() => createKnowledge(entries, 60), /Unknown/);
});

test('players and word files use 4-15 letters', () => {
  assert.equal(MIN_WORD_LENGTH, 4);
  assert.equal(MAX_WORD_LENGTH, 15);
  assert.throws(() => parseLexicon('cat 35\n', 3), RangeError);
  assert.deepEqual(parseLexicon('cats 35\n', 4).map(entry => entry.word), ['cats']); // Positive control.
  assert.equal(isAcceptedWord('cat', entriesOf('cat 35')), false);
  assert.equal(isAcceptedWord('cats', entriesOf('cats 35')), true); // Positive control.
  assert.equal(isWordShape('cat'), false);
  assert.equal(isWordShape('cats'), true);
  assert.equal(isWordShape('a'.repeat(15)), true);
  assert.equal(isWordShape('a'.repeat(16)), false);
  assert.equal(isWordShape('Cats'), false);
  assert.equal(isWordShape('ca ts'), false);
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

test('zero-candidate fallback uses only its own tier, with deterministic unused-letter ties', () => {
  const entries = entriesOf('cat 35\ndog 35\nfib 70\nfob 70\nfox 70\n');
  const low = createKnowledge(entries, 35);
  const master = createKnowledge(entries);
  const state = toPublicState(roundAfter('fox', 'f'));
  assert.deepEqual(low.words, ['cat', 'dog']);
  assert.equal(low.frequency.f, 0);
  assert.equal(master.frequency.f, 3);
  assert.equal(chooseLetter(state, master), 'b'); // b and o tie; alphabetical b wins.
  for (const policy of POLICIES) {
    assert.deepEqual(analyzeDecision(state, low, policy),
      { letter: 'a', candidateCount: 0, hitCount: 0, fallback: true });
  }
  assert.equal(chooseLetter(toPublicState(roundAfter('fox', 'fa')), low), 'c');
  assert.deepEqual(low.words, ['cat', 'dog']);
  // No unmentioned higher-tier vocabulary may be consulted or silently added.
  const extended = entriesOf('cat 35\ndog 35\nfib 70\nfob 70\nfox 70\nzzz 70\n');
  assert.deepEqual(analyzeDecision(state, createKnowledge(extended, 35)), analyzeDecision(state, low));
  assert.throws(() => chooseLetter(state, knowledgeOf(['cat', 'dog'])), /Master invariant/);
});

test('fallback handles empty tier vocabularies and exhausted frequency counts without repeats', () => {
  const entries = entriesOf('fox 70\n');
  const low = createKnowledge(entries, 35);
  assert.equal(low.words.length, 0);
  assert.equal(chooseLetter(toPublicState(createRound('fox')), low), 'a');
  assert.equal(chooseLetter(toPublicState(roundAfter('fox', 'ab')), low), 'c');
  assert.equal(chooseLetter(toPublicState(roundAfter('fox', 'abcdef')), low), 'g'); // f is a hit, only five misses.
  assert.equal(chooseLetter(toPublicState(roundAfter('fox', 'abcdeg')), low), null);
  assert.equal(chooseLetter(toPublicState(roundAfter('fox', 'fox')), low), null);
  assert.equal(chooseLetter(toPublicState(createRound('fox')), createKnowledge(entries)), 'f');
});

test('Apprentice and Scholar fallback frequencies respect their separate ceilings', () => {
  const entries = entriesOf('abc 35\nbbb 50\nxbx 70\n');
  const apprentice = createKnowledge(entries, 35);
  const scholar = createKnowledge(entries, 50);
  const state = toPublicState(roundAfter('xbx', 'x'));
  assert.equal(scholar.frequency.b, 2); // bbb contributes one word, not three occurrences.
  assert.equal(chooseLetter(state, apprentice), 'a');
  assert.equal(chooseLetter(state, scholar), 'b');
  assert.equal(apprentice.words.includes('bbb'), false);
  assert.equal(scholar.words.includes('bbb'), true);
  assert.equal(scholar.words.includes('xbx'), false);
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
