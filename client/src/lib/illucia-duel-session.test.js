import assert from 'node:assert/strict';
import test from 'node:test';
import { applyGuess, getPattern } from './hangman-core.js';
import { VOCABULARY_TIERS } from './illucia/lexicon.js';
import { parseCategories, parseLabels } from './illucia/questions.js';
import { ILLUCIA_ALREADY_WON_MESSAGE, illuciaStumpPoints } from '../../../shared/scoring-protocol.js';
import { AI_LEAN, LADDER_RESET, answerQuestion, applyConsult, createSession, herKnowledge, ladderStep, previewPoints,
  rememberLine, roundStakes, startWarning, takeTurn } from './illucia/duel-session.js';

const [APPRENTICE, SCHOLAR, MASTER] = VOCABULARY_TIERS;
const ZERO_LETTERS = Object.fromEntries([...'abcdefghijklmnopqrstuvwxyz'].map(letter => [letter, 0]));
const CATEGORIES = parseCategories({ categories: [
  { code: 'c', key: 'bird', kind: 'noun', question: 'Can your word mean a bird?', kindOf: { 'oewn-1-n': 'bird' } },
  { code: 'o', key: 'artifact', kind: 'noun', question: 'Can your word mean a man-made object?', lexfiles: ['noun.artifact'] },
] });
// Four birds and four objects, equally common; wren is unknown to WordNet.
const WORDS = ['bolt', 'crow', 'hawk', 'kite', 'nail', 'rake', 'tack', 'wren'];
const ENTRIES = WORDS.map(word => Object.freeze({ word, size: 35 }));
const LABELS = parseLabels('bolt o\ncrow c\nhawk c\nkite co\nnail o\nrake o\ntack o\n', 4, CATEGORIES);
const ASSETS = { entries: ENTRIES, questions: { labels: LABELS, categories: CATEGORIES } };
const LETTERS_ONLY = { entries: ENTRIES, questions: null };
const ticket = (extra = {}) => ({ roundId: 'r1', seed: 4242, experimental: false, ladder: LADDER_RESET,
  points: { eligible: true, stump: illuciaStumpPoints('master', 4, 0) }, memory: null, ...extra });
// Two misses that leave every word possible (q and z are in none), so she may ask.
const afterMisses = session => ({ ...session, round: [...'qz'].reduce(applyGuess, session.round) });

test('a session takes the server seed and her memory, and plays unscored with a local seed', () => {
  // zarf is rare (size 70): Apprentice knows it only once it has beaten her.
  const assets = { entries: [...ENTRIES, Object.freeze({ word: 'zarf', size: 70 })], questions: null };
  const brain = { personalitySeed: 7, games: 1, letters: { ...ZERO_LETTERS, z: 1, a: 1, r: 1, f: 1 }, learned: ['zarf'] };
  const scored = createSession('crow', assets, APPRENTICE, ticket({ memory: { brain, voice: { plays: 1, everyone: 2 } } }));
  assert.equal(scored.seed, 4242);
  assert.ok(scored.knowledge.words.includes('zarf'));
  assert.ok(scored.knowledge.learned.has('zarf'));
  // Positive control: without memory she knows only her tier's words.
  assert.deepEqual(createSession('crow', assets, APPRENTICE, ticket()).knowledge.words, WORDS);
  // A malformed brain (voice must never reach her guessing) is dropped, not trusted.
  const bad = createSession('crow', assets, APPRENTICE, ticket({ memory: { brain: { ...brain, voice: {} } } }));
  assert.deepEqual(bad.knowledge.words, WORDS);
  const local = createSession('crow', LETTERS_ONLY, MASTER, null);
  assert.ok(Number.isInteger(local.seed) && local.seed >= 0);
  assert.equal(local.points, null);
  assert.equal(local.experimental, false);
});

test('her letter turn applies the guess, reports the tiles it filled and keeps the page fields', () => {
  const session = { ...createSession('crow', LETTERS_ONLY, MASTER, ticket()), log: ['kept'], stars: 3 };
  const turn = takeTurn(session);
  assert.equal(turn.type, 'letter');
  assert.deepEqual(turn.session.round.guesses, [turn.letter]);
  assert.deepEqual(turn.session.log, ['kept']);
  assert.equal(turn.session.stars, 3);
  const pattern = getPattern(turn.session.round);
  assert.deepEqual(turn.positions, pattern.flatMap((value, index) => (value ? [index] : [])));
  assert.equal(turn.countBefore, 8);
  assert.equal(turn.share, Math.round(turn.decision.hitCount / 8 * 100));
  // The session it came from is unchanged.
  assert.deepEqual(session.round.guesses, []);
});

test('a solver failure is an error turn, with the session unchanged', () => {
  // Master knows only abcd; once A misses, no word fits, which is a bug at Master and throws.
  const session = createSession('wxyz', { entries: [{ word: 'abcd', size: 35 }], questions: null }, MASTER, ticket());
  const first = takeTurn(session);
  assert.equal(first.type, 'letter');
  const second = takeTurn(first.session);
  assert.equal(second.type, 'error');
  assert.equal(second.session, first.session);
});

test('she asks at most once per letter, and the answer is checked against the archive', () => {
  const session = afterMisses(createSession('crow', ASSETS, MASTER, ticket()));
  const asked = takeTurn(session);
  assert.equal(asked.type, 'question');
  assert.equal(asked.question.question, 'Can your word mean a bird?');
  assert.deepEqual(asked.session.pending, { question: asked.question, checkable: true });
  assert.equal(asked.session.askedAt, 2);
  assert.equal(asked.session.round, session.round); // a question is not a guess
  assert.equal(answerQuestion(session, 'yes'), null); // nothing to answer yet

  const right = answerQuestion(asked.session, 'yes');
  assert.equal(right.outcome, 'confirmed');
  assert.equal(right.session.verified, 1);
  assert.equal(right.session.pending, null);
  assert.deepEqual(right.session.offers, [{ code: 'c', answer: 'yes' }]);
  // She filters on the answer: birds, and wren (unknown) stays on both sides.
  assert.deepEqual(herKnowledge(right.session).words, ['crow', 'hawk', 'kite', 'wren']);
  assert.equal(takeTurn(right.session).type, 'letter');

  const wrong = answerQuestion(asked.session, 'no');
  assert.equal(wrong.outcome, 'corrected');
  assert.equal(wrong.truth, 'yes');
  assert.equal(wrong.session.verified, 0);
  assert.deepEqual(wrong.session.offers, [{ code: 'c', answer: 'yes' }]);

  const declined = answerQuestion(asked.session, 'declined');
  assert.equal(declined.outcome, 'declined');
  assert.deepEqual(herKnowledge(declined.session).words, WORDS);
});

test('an unknown word cannot be checked: the answer is taken on trust and earns nothing', () => {
  const asked = takeTurn(afterMisses(createSession('wren', ASSETS, MASTER, ticket())));
  assert.equal(asked.session.pending.checkable, false);
  const result = answerQuestion(asked.session, 'yes');
  assert.equal(result.outcome, 'unchecked');
  assert.equal(result.session.verified, 0);
  assert.deepEqual(result.session.offers, [{ code: 'c', answer: 'yes' }]);
});

test('experimental mode consults her AI helper once per letter and leans on the answer', () => {
  const session = afterMisses(createSession('crow', ASSETS, MASTER, ticket({ experimental: true, points: { eligible: false, stump: 0 } })));
  const consult = takeTurn(session);
  assert.equal(consult.type, 'consult');
  assert.deepEqual(consult.candidates, WORDS);
  assert.equal(consult.session.aiTriedAt, 2);
  // A failed reply: no question, and she does not ask again before her next letter.
  const failed = applyConsult(consult.session, { ok: false, reason: 'budget', questionsLeft: 1 });
  assert.equal(failed.pending, null);
  assert.equal(failed.aiLeft, 1);
  assert.equal(takeTurn(failed).type, 'letter');

  const birds = ['crow', 'hawk', 'kite'];
  const asked = applyConsult(consult.session, { ok: true, question: 'Does it fly?', yes: birds, no: WORDS.filter(word => !birds.includes(word)), questionsLeft: 5 });
  assert.equal(asked.aiLeft, 1); // never more than she has left
  assert.equal(asked.askedAt, 2);
  assert.equal(asked.pending.ai, true);
  const answered = answerQuestion(asked, 'yes');
  assert.equal(answered.outcome, 'answered');
  assert.equal(answered.session.verified, 0);
  const knowledge = herKnowledge(answered.session);
  assert.deepEqual(knowledge.words, WORDS); // nothing ruled out
  assert.equal(knowledge.weights.get('hawk'), session.knowledge.weights.get('hawk') * AI_LEAN);
  assert.equal(knowledge.weights.get('bolt'), session.knowledge.weights.get('bolt'));
  // No WordNet question in experimental mode, and no consult without a ticket.
  assert.equal(takeTurn(afterMisses(createSession('crow', ASSETS, MASTER, null))).type, 'question');
});

test('points, the ladder and the warnings before a word is committed', () => {
  const session = createSession('crow', LETTERS_ONLY, MASTER, ticket());
  assert.equal(previewPoints(session), illuciaStumpPoints('master', 4, 0));
  assert.equal(previewPoints(session, 1), illuciaStumpPoints('master', 4, 1));
  assert.equal(previewPoints(createSession('crow', LETTERS_ONLY, MASTER, null)), 0);

  assert.equal(ladderStep(LADDER_RESET, APPRENTICE, 4), 'start');
  assert.equal(ladderStep({ rung: 1, next: 'scholar', minLength: 5 }, SCHOLAR, 5), 'climb');
  assert.equal(ladderStep({ rung: 2, next: 'master', minLength: 6 }, MASTER, 6), 'top');
  assert.equal(ladderStep({ rung: 2, next: 'master', minLength: 6 }, MASTER, 5), null);
  assert.equal(ladderStep(null, MASTER, 6), null);

  assert.deepEqual(roundStakes(null, MASTER, 4), { from: 'stakes', text: 'This duel is not scored: the scorekeeper could not be reached.' });
  assert.deepEqual(roundStakes(ticket({ points: { eligible: false, stump: 0, reason: 'ALREADY_WON' } }), MASTER, 4),
    { from: 'illucia', text: ILLUCIA_ALREADY_WON_MESSAGE });
  assert.equal(roundStakes(ticket(), MASTER, 4).text, 'A win is worth 50 points.');

  const entries = [{ word: 'crow', size: 35 }, { word: 'wren', size: 70 }];
  assert.equal(startWarning('crow', entries, MASTER, null, new Set(), false), '');
  assert.equal(startWarning('wren', entries, APPRENTICE, null, new Set(), false),
    'Apprentice does not know this word: you can still win, but it earns no points.');
  assert.equal(startWarning('crow', entries, MASTER, null, new Set(['crow']), false), ILLUCIA_ALREADY_WON_MESSAGE);
  assert.equal(startWarning('crow', entries, MASTER, { rung: 1, next: 'scholar', minLength: 5 }, new Set(), false),
    'This resets your ladder (next rung: Scholar with 5+ letters).');
  assert.equal(startWarning('wren', entries, APPRENTICE, null, new Set(), true), '');
});

test('her memory line knows the word only once it is out', () => {
  const brain = { personalitySeed: 7, games: 1, letters: { ...ZERO_LETTERS, c: 1, r: 1, o: 1, w: 1 }, learned: ['crow'] };
  const learned = createSession('crow', LETTERS_ONLY, MASTER, ticket({ memory: { brain, voice: { plays: 1, everyone: 1 } } }));
  assert.equal(rememberLine(learned, true), 'CROW… AGAIN?? I learned that word from you, and it still beat me.');
  const played = createSession('crow', LETTERS_ONLY, MASTER, ticket({ memory: { brain: { ...brain, learned: [] }, voice: { plays: 2, everyone: 5 } } }));
  assert.equal(rememberLine(played, false), 'CROW again? You have set it against me twice before.');
  assert.equal(rememberLine(createSession('crow', LETTERS_ONLY, MASTER, null), false), null);
});
