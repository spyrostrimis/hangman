import assert from 'node:assert/strict';
import test from 'node:test';
import { createRound, applyGuess, getRoundStatus } from './hangman-core.js';
import { toPublicState } from './illucia/public-state.js';
import { filterCandidates } from './illucia/candidates.js';
import { MAX_WORD_LENGTH, MIN_WORD_LENGTH, VOCABULARY_TIERS, commonnessWeight, parseLexicon, createKnowledge, isAcceptedWord, isWordShape } from './illucia/lexicon.js';
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
  assert.deepEqual(analyzeDecision(state, knowledge, 'count'),
    { letter: 'b', candidateCount: 3, hitCount: 2, weightedHits: 20, candidateWeight: 30, share: 6666, tiedWith: ['c'] });
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
  assert.deepEqual(analyzeDecision(state, createKnowledge(extended, 35), 'count'), analyzeDecision(state, low, 'count'));
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

// Characterization for v2 A1 weighting (written against the unweighted solver).
// Reference: unweighted hit-counting over surviving candidates, alphabetical ties.
function referenceCountLetter(state, words) {
  const guessed = new Set(state.guessedLetters);
  const candidates = filterCandidates(state, words);
  let best = null;
  let bestCount = -1;
  for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
    if (guessed.has(letter)) continue;
    const count = candidates.filter(word => word.includes(letter)).length;
    if (count > bestCount) { best = letter; bestCount = count; }
  }
  return { letter: best, candidates: candidates.length, hits: bestCount };
}

const UNIFORM_WORDS = ['bath', 'beam', 'bean', 'bear', 'beat', 'bite', 'boat', 'bolt', 'cart', 'case',
  'cash', 'cast', 'coat', 'code', 'cold', 'cone', 'dare', 'dart', 'date', 'dean', 'dome', 'gate',
  'hate', 'heat', 'lane', 'late', 'mate', 'meat', 'neat', 'note', 'rate', 'seat', 'tame', 'tone'];

test('one commonness level plays exactly like unweighted hit-counting (Apprentice is unchanged)', () => {
  const knowledge = createKnowledge(entriesOf(UNIFORM_WORDS.map(word => `${word} 35`).join('\n')), 35);
  let decisions = 0;
  for (const answer of UNIFORM_WORDS) {
    let round = createRound(answer);
    while (getRoundStatus(round) === 'playing') {
      const state = toPublicState(round);
      const expected = referenceCountLetter(state, knowledge.words);
      const decision = analyzeDecision(state, knowledge, 'count');
      assert.equal(decision.letter, expected.letter);
      assert.equal(decision.candidateCount, expected.candidates);
      assert.equal(decision.hitCount, expected.hits);
      round = applyGuess(round, decision.letter);
      decisions++;
    }
  }
  assert.ok(decisions > UNIFORM_WORDS.length * 3);
});

test('candidate and hit counts stay plain word counts at every tier', () => {
  const entries = entriesOf('aaxx 35\nbbxx 50\nbcxx 50\nbdxx 70\nbexx 70');
  const state = toPublicState(roundAfter('aaxx', 'x'));
  for (const maxSize of [35, 50, 70]) {
    const knowledge = createKnowledge(entries, maxSize);
    const decision = analyzeDecision(state, knowledge, 'count');
    const candidates = filterCandidates(state, knowledge.words);
    assert.equal(decision.candidateCount, candidates.length);
    assert.equal(decision.hitCount, candidates.filter(word => word.includes(decision.letter)).length);
  }
});

test('the zero-candidate fallback counts words, not commonness weights', () => {
  // Scholar knows one common A word and two size-50 B words; none fits X_X_.
  const entries = entriesOf('aaaa 35\nbbbb 50\nbbbc 50\nxyxy 70');
  const scholar = createKnowledge(entries, 50);
  const decision = analyzeDecision(toPublicState(roundAfter('xyxy', 'x')), scholar, 'count');
  assert.equal(decision.fallback, true);
  assert.equal(decision.letter, 'b'); // B is in 2 words, A in 1; weighting A's word would choose A.
  // Positive control on the same knowledge: before any guess there are candidates, so no fallback.
  assert.equal(analyzeDecision(toPublicState(createRound('bbbb')), scholar, 'count').fallback, undefined);
});

test('commonness weights are the integers 10/3/1 (v2 A1)', () => {
  assert.deepEqual([35, 40, 50, 55, 60, 65, 70].map(commonnessWeight), [10, 3, 3, 1, 1, 1, 1]);
  const knowledge = createKnowledge(entriesOf('aaaa 35\nbbbb 40\ncccc 50\ndddd 60\neeee 70'), 70);
  assert.deepEqual([...knowledge.weights], [['aaaa', 10], ['bbbb', 3], ['cccc', 3], ['dddd', 1], ['eeee', 1]]);
  // A tier weighs only the words it knows.
  assert.deepEqual([...createKnowledge(knowledge.words.map(word => ({ word, size: 70 })), 35).weights], []);
});

test('weighted candidates: one common word outweighs a few rare ones', () => {
  // Pattern _ _ x x: A is in one common word; B is in rarer words.
  const state = toPublicState(roundAfter('aaxx', 'x'));
  const master = createKnowledge(entriesOf('aaxx 35\nbbxx 70\nbcxx 70\nbdxx 70\nbexx 70\nbfxx 70\nbgxx 70\nbhxx 70\nbixx 70\nbjxx 70'), 70);
  // 9 rare B words weigh 9; the one common A word weighs 10.
  assert.deepEqual(analyzeDecision(state, master, 'count'),
    { letter: 'a', candidateCount: 10, hitCount: 1, weightedHits: 10, candidateWeight: 19, share: 5263, tiedWith: [] });
  // Positive control: with every word at one level, plain counting picks B (9 words to 1).
  const flat = createKnowledge(entriesOf('aaxx 35\nbbxx 35\nbcxx 35\nbdxx 35\nbexx 35\nbfxx 35\nbgxx 35\nbhxx 35\nbixx 35\nbjxx 35'), 35);
  assert.equal(analyzeDecision(state, flat, 'count').letter, 'b');
  // Scholar's middle weight: 3 size-50 words (9) lose to one common word (10); 4 (12) win.
  const scholarState = toPublicState(roundAfter('aaxx', 'x'));
  assert.equal(analyzeDecision(scholarState, createKnowledge(entriesOf('aaxx 35\nbbxx 50\nbcxx 50\nbdxx 50'), 50), 'count').letter, 'a');
  assert.equal(analyzeDecision(scholarState, createKnowledge(entriesOf('aaxx 35\nbbxx 50\nbcxx 50\nbdxx 50\nbexx 50'), 50), 'count').letter, 'b');
});

test('an injected weight function changes only the ranking (benchmark sweeps)', () => {
  const entries = entriesOf('aaxx 35\nbbxx 70\nbcxx 70');
  const state = toPublicState(roundAfter('aaxx', 'x'));
  assert.equal(analyzeDecision(state, createKnowledge(entries, 70), 'count').letter, 'a');
  assert.equal(analyzeDecision(state, createKnowledge(entries, 70, () => 1), 'count').letter, 'b');
  assert.throws(() => createKnowledge(entries, 70, () => 0.5), /positive integer/);
});

// Characterization for v2 A2 (written against the A1 solver): the strict weighted count.
function referenceWeightedLetter(state, knowledge) {
  const guessed = new Set(state.guessedLetters);
  const candidates = filterCandidates(state, knowledge.words);
  let best = null;
  let bestWeight = -1;
  for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
    if (guessed.has(letter)) continue;
    const weight = candidates.filter(word => word.includes(letter))
      .reduce((sum, word) => sum + knowledge.weights.get(word), 0);
    if (weight > bestWeight) { best = letter; bestWeight = weight; }
  }
  return best;
}

const MIXED = entriesOf(['bath 35', 'beam 50', 'bean 70', 'bear 35', 'beat 40', 'bite 60', 'boat 35', 'bolt 70',
  'cart 50', 'case 35', 'cash 65', 'cast 35', 'coat 70', 'code 35', 'cold 50', 'cone 60', 'dare 35', 'dart 70',
  'date 35', 'dean 50', 'dome 70', 'gate 35', 'hate 40', 'heat 35', 'lane 70', 'late 35', 'mate 60', 'meat 35',
  'neat 50', 'note 35', 'rate 35', 'seat 70', 'tame 50', 'tone 35'].join('\n'));

test('the strict count picks the heaviest letter, ties alphabetical, at every tier', () => {
  let decisions = 0;
  for (const maxSize of [35, 50, 70]) {
    const knowledge = createKnowledge(MIXED, maxSize);
    for (const answer of knowledge.words) {
      let round = createRound(answer);
      while (getRoundStatus(round) === 'playing') {
        const state = toPublicState(round);
        const decision = analyzeDecision(state, knowledge, 'count');
        assert.equal(decision.letter, referenceWeightedLetter(state, knowledge));
        round = applyGuess(round, decision.letter);
        decisions++;
      }
    }
  }
  assert.ok(decisions > 150);
});

test('the decision record gives her letter weighted share and the letters tied with it', () => {
  // _ _ x x: A is in aaxx (10); B in bbxx and bcxx (3 + 3 = 6); C in bcxx (3); D in ddxx (10).
  const knowledge = createKnowledge(entriesOf('aaxx 35\nbbxx 50\nbcxx 50\nddxx 35'), 70);
  const decision = analyzeDecision(toPublicState(roundAfter('aaxx', 'x')), knowledge, 'count');
  assert.equal(decision.letter, 'a');
  assert.equal(decision.candidateWeight, 26);
  assert.equal(decision.share, Math.floor(10 * 10000 / 26)); // Hundredths of a percent, as an integer.
  assert.deepEqual(decision.tiedWith, ['d']);
  // Positive control: without the tie, nothing is tied.
  const alone = analyzeDecision(toPublicState(roundAfter('aaxx', 'x')),
    createKnowledge(entriesOf('aaxx 35\nbbxx 50\nbcxx 50'), 70), 'count');
  assert.deepEqual(alone.tiedWith, []);
});

test('letters already guessed are never listed as tied', () => {
  // _ _ x x after X: every candidate holds A and X, so A weighs exactly as much as the revealed X.
  const knowledge = createKnowledge(entriesOf('aaxx 35\nabxx 35'), 70);
  const decision = analyzeDecision(toPublicState(roundAfter('aaxx', 'x')), knowledge, 'count');
  assert.equal(decision.letter, 'a');
  assert.equal(decision.weightedHits, decision.candidateWeight); // Same weight as X.
  assert.deepEqual(decision.tiedWith, []);
});

// v2 A2 temperament. Fixture: 20 three-letter strings; B is in 60% of them, C in 55%, D in 45%,
// the rest are filler consonants (each about 10%). No vowels, so the vowel bonus stays out of it.
const FILLER = 'fghjklmnprstv';
const SHARES_WORDS = (() => {
  let next = 0;
  return Array.from({ length: 20 }, (_, i) => {
    let core = (i < 12 ? 'b' : '') + (i >= 9 ? 'c' : '') + (i < 9 ? 'd' : '');
    while (core.length < 3) core += FILLER[next++ % FILLER.length];
    return core;
  });
})();
const sharesKnowledge = () => createKnowledge(entriesOf(SHARES_WORDS.map(word => `${word} 35`).join('\n')), 35);
const tierTemperament = id => VOCABULARY_TIERS.find(tier => tier.id === id).temperament;
const picks = (state, knowledge, temperament, seeds = 400) => {
  const counts = {};
  for (let seed = 0; seed < seeds; seed++) {
    const { letter } = analyzeDecision(state, knowledge, { seed, temperament });
    counts[letter] = (counts[letter] ?? 0) + 1;
  }
  return counts;
};

test('fixture check: the shares are 60 / 55 / 45%', () => {
  const decision = analyzeDecision(toPublicState(createRound(SHARES_WORDS[0])), sharesKnowledge(), 'count');
  assert.equal(new Set(SHARES_WORDS).size, 20);
  assert.equal(decision.letter, 'b');
  assert.equal(decision.share, 6000);
  assert.equal(SHARES_WORDS.filter(word => word.includes('c')).length, 11);
  assert.equal(SHARES_WORDS.filter(word => word.includes('d')).length, 9);
});

test('her temperament needs a round seed; the strict policies do not', () => {
  const state = toPublicState(createRound(SHARES_WORDS[0]));
  assert.throws(() => analyzeDecision(state, sharesKnowledge(), {}), /seed/);
  assert.throws(() => analyzeDecision(state, sharesKnowledge(), { seed: -1 }), /seed/);
  assert.equal(analyzeDecision(state, sharesKnowledge(), 'count').letter, 'b'); // Positive control.
  assert.match(analyzeDecision(state, sharesKnowledge(), { seed: 1 }).letter, /^[a-z]$/);
});

test('exploring: a weighted pick within the tier width of her best, better letters more likely', () => {
  const state = toPublicState(createRound(SHARES_WORDS[0]));
  const apprentice = picks(state, sharesKnowledge(), tierTemperament('apprentice'));
  const scholar = picks(state, sharesKnowledge(), tierTemperament('scholar'));
  const master = picks(state, sharesKnowledge(), tierTemperament('master'));
  // C is 5 points below B: inside Apprentice's 10 and Scholar's 7, outside Master's 4. D is 15 below.
  assert.deepEqual(Object.keys(apprentice).sort(), ['b', 'c']);
  assert.deepEqual(Object.keys(scholar).sort(), ['b', 'c']);
  assert.deepEqual(master, { b: 400 });
  // Linear odds above the cut-off: Apprentice B:C = 10:5, Scholar B:C = 7:2.
  assert.ok(Math.abs(apprentice.b / 400 - 2 / 3) < 0.07, JSON.stringify(apprentice));
  assert.ok(Math.abs(scholar.b / 400 - 7 / 9) < 0.07, JSON.stringify(scholar));
  const decision = analyzeDecision(state, sharesKnowledge(), { seed: 3, temperament: tierTemperament('apprentice') });
  assert.equal(decision.mode, 'exploring');
  assert.deepEqual(decision.shortlist.map(entry => entry.letter), ['b', 'c']);
  assert.deepEqual(decision.best, ['b']);
});

test('careful with 1-2 misses left: strictly the best letter, ties broken by the seed', () => {
  const careful = toPublicState(roundAfter(SHARES_WORDS[0], 'qxyz')); // Four misses: two left.
  assert.equal(careful.missesLeft, 2);
  for (const id of ['apprentice', 'scholar', 'master']) {
    assert.deepEqual(picks(careful, sharesKnowledge(), tierTemperament(id), 200), { b: 200 });
  }
  const decision = analyzeDecision(careful, sharesKnowledge(), { seed: 0, temperament: tierTemperament('apprentice') });
  assert.equal(decision.mode, 'careful');
  assert.equal(decision.choseBest, true);
  // Positive control on the same fixture: with three misses left she explores again.
  const three = toPublicState(roundAfter(SHARES_WORDS[0], 'qxy'));
  assert.deepEqual(Object.keys(picks(three, sharesKnowledge(), tierTemperament('apprentice'), 200)).sort(), ['b', 'c']);
  // A tie at the top is settled by the seed, not the alphabet: B and C are both in 12 of 16 words.
  const tied = createKnowledge(entriesOf(['bcf', 'bcg', 'bch', 'bcj', 'bck', 'bcl', 'bcm', 'bcn', 'bcp', 'bcr',
    'bcs', 'bct', 'dfg', 'dhj', 'dkl', 'dmn'].map(word => `${word} 35`).join('\n')), 35);
  const tiedState = toPublicState(roundAfter('bcf', 'qxyz'));
  assert.deepEqual(Object.keys(picks(tiedState, tied, tierTemperament('master'), 200)).sort(), ['b', 'c']);
  assert.equal(analyzeDecision(tiedState, tied, { seed: 0, temperament: tierTemperament('master') }).tiedWith.length, 1);
});

test('the vowel bonus lifts vowels early, fades, never rescues a letter in no word, and skips careful mode', () => {
  // 100 four-letter strings: B is in 60, A in 57. Apprentice's +6 points make A her best at turn 0.
  const pad = 'cdfghjklmnprstvw';
  const words = Array.from({ length: 100 }, (_, i) =>
    (i < 60 ? 'b' : 'q') + (i >= 43 ? 'a' : 'z') + pad[i % 16] + pad[Math.floor(i / 16) % 16]);
  assert.equal(new Set(words).size, 100);
  const knowledge = createKnowledge(entriesOf(words.map(word => `${word} 35`).join('\n')), 35);
  assert.equal(words.filter(word => word.includes('b')).length, 60);
  assert.equal(words.filter(word => word.includes('a')).length, 57);
  const apprentice = tierTemperament('apprentice');
  assert.deepEqual(analyzeDecision(toPublicState(createRound(words[0])), knowledge, { seed: 1, temperament: apprentice }).best, ['a']);
  // Positive control: Master's +2 points are not enough, so B stays her best.
  assert.deepEqual(analyzeDecision(toPublicState(createRound(words[0])), knowledge, { seed: 1, temperament: tierTemperament('master') }).best, ['b']);
  // After three turns the bonus has faded. E, I and O are in no word: the bonus never made them eligible.
  const late = toPublicState(roundAfter(words[0], 'eio'));
  assert.equal(late.missesLeft, 3);
  assert.deepEqual(analyzeDecision(late, knowledge, { seed: 1, temperament: apprentice }).best, ['b']);
  for (let seed = 0; seed < 200; seed++) {
    assert.match(analyzeDecision(toPublicState(createRound(words[0])), knowledge, { seed, temperament: apprentice }).letter, /^[ab]$/);
  }
  // Careful mode ignores the bonus even inside the bonus window: B, not A.
  const carefulEarly = toPublicState(roundAfter(words[0], 'eiou'));
  assert.equal(carefulEarly.missesLeft, 2);
  assert.deepEqual(analyzeDecision(carefulEarly, knowledge, { seed: 1, temperament: { ...apprentice, vowelTurns: 10 } }).best, ['b']);
  // Positive control: the same board with the bonus window open but one more miss to spare picks up the bonus.
  const exploringLate = toPublicState(roundAfter(words[0], 'eio'));
  assert.deepEqual(analyzeDecision(exploringLate, knowledge, { seed: 1, temperament: { ...apprentice, vowelTurns: 10 } }).best, ['a']);
});

test('the same seed and board always give the same decision', () => {
  const state = toPublicState(createRound(SHARES_WORDS[0]));
  const temperament = tierTemperament('apprentice');
  for (let seed = 0; seed < 50; seed++) {
    assert.deepEqual(analyzeDecision(state, sharesKnowledge(), { seed, temperament }),
      analyzeDecision(state, sharesKnowledge(), { seed, temperament }));
  }
});

test('the fallback breaks ties with the seed, not the alphabet', () => {
  // Apprentice knows two words with disjoint letters; the answer is outside her vocabulary.
  const entries = entriesOf('bcdf 35\nghjk 35\nwxyz 70');
  const low = createKnowledge(entries, 35);
  const state = toPublicState(roundAfter('wxyz', 'w'));
  const seen = new Set();
  for (let seed = 0; seed < 100; seed++) {
    const decision = analyzeDecision(state, low, { seed, temperament: tierTemperament('apprentice') });
    assert.equal(decision.fallback, true);
    seen.add(decision.letter);
  }
  assert.ok(seen.size > 2, [...seen].join(''));
  assert.ok([...seen].every(letter => 'bcdfghjk'.includes(letter)));
  // Positive control: the strict policy still breaks the same tie alphabetically.
  assert.equal(analyzeDecision(state, low, 'count').letter, 'b');
});

test('a letter in no candidate is never picked, even when the vowel bonus would reach the shortlist', () => {
  // 25 words, each with its own two consonants: every letter's share is 4-8%, so a vowel in no
  // word gets Apprentice's +6 points, which would put it within 10 points of the best.
  const consonants = 'bcdfghjklmnpqrstvwxz';
  const words = Array.from({ length: 25 }, (_, i) => consonants[i % 20] + consonants[(i * 7 + 3) % 20] + 'y');
  const unique = [...new Set(words)];
  const knowledge = createKnowledge(entriesOf(unique.map(word => `${word} 35`).join('\n')), 35);
  const state = toPublicState(roundAfter(unique[0], 'y'));
  const seen = new Set();
  for (let seed = 0; seed < 300; seed++) {
    seen.add(analyzeDecision(state, knowledge, { seed, temperament: tierTemperament('apprentice') }).letter);
  }
  assert.equal([...seen].some(letter => 'aeiou'.includes(letter)), false, [...seen].join(''));
  assert.ok(seen.size > 3); // Positive control: she does explore among the consonants here.
});

test('the vowel bonus fades turn by turn: 6, 4, then 2 points for Apprentice', () => {
  const pad = 'cdfghjklmnprstvw';
  const words = Array.from({ length: 100 }, (_, i) =>
    (i < 60 ? 'b' : 'q') + (i >= 43 ? 'a' : 'z') + pad[i % 16] + pad[Math.floor(i / 16) % 16]);
  const knowledge = createKnowledge(entriesOf(words.map(word => `${word} 35`).join('\n')), 35);
  const apprentice = tierTemperament('apprentice');
  const bonusOnA = guesses => {
    const state = toPublicState(roundAfter(words[0], guesses));
    for (let seed = 0; seed < 500; seed++) {
      const decision = analyzeDecision(state, knowledge, { seed, temperament: apprentice });
      if (decision.letter === 'a') return decision.vowelBonus;
    }
    return null;
  };
  assert.deepEqual([bonusOnA(''), bonusOnA('e'), bonusOnA('ei'), bonusOnA('eio')], [600, 400, 200, 0]);
});

test('each turn draws afresh from the round seed', () => {
  // The same candidates at turn 0 and turn 1 (Q is in no word): the picks must not be a copy.
  const knowledge = sharesKnowledge();
  const first = toPublicState(createRound(SHARES_WORDS[0]));
  const second = toPublicState(roundAfter(SHARES_WORDS[0], 'q'));
  const temperament = tierTemperament('apprentice');
  let differ = 0;
  for (let seed = 0; seed < 200; seed++) {
    if (analyzeDecision(first, knowledge, { seed, temperament }).letter !==
      analyzeDecision(second, knowledge, { seed, temperament }).letter) differ++;
  }
  assert.ok(differ > 30, `${differ}`);
});

test('every caller must choose: a strict policy name or her temperament with a seed', () => {
  const state = toPublicState(createRound(SHARES_WORDS[0]));
  assert.throws(() => analyzeDecision(state, sharesKnowledge()), /strict policy name or/);
  assert.equal(analyzeDecision(state, sharesKnowledge(), 'count').letter, 'b'); // Positive control.
  assert.equal(chooseLetter(state, sharesKnowledge()), 'b'); // chooseLetter is the strict count (tools).
});
