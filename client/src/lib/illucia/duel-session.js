import { applyGuess, createRound, getPattern } from '../hangman-core.js';
import { MIN_WORD_LENGTH, VOCABULARY_TIERS, commonnessWeight, createKnowledge } from './lexicon.js';
import { toBrain } from './brain.js';
import { toPublicState } from './public-state.js';
import { filterCandidates } from './candidates.js';
import { analyzeDecision } from './strategy.js';
import { newLocalSeed } from './random.js';
import { EARLIEST_TURN, MAX_QUESTIONS, checkAnswer, chooseQuestion, narrowKnowledge } from './questions.js';
import { memoryLine } from './duel-lines.js';
import { ILLUCIA_ALREADY_WON_MESSAGE, ILLUCIA_NO_POINTS, illuciaStumpPoints } from '../../../../shared/scoring-protocol.js';

// One Illucia duel, shared by /illucia and /illucia-observatory: her knowledge for the round,
// what she does on her turn, what an answer changes, and what the round is worth. Pure: each
// function takes a session and returns a new one. A session is a plain object, and every
// function keeps fields it does not know, so a page can carry its own (log, phase, stars).

// Experimental mode (v2 E5): she asks her AI helper only over 2-80 candidates, and leans on the
// answer rather than trusting it: words on the answered side weigh this many times more.
export const AI_MAX_CANDIDATES = 80;
export const AI_LEAN = 3;
export const tierLabel = id => VOCABULARY_TIERS.find(tier => tier.id === id)?.label ?? id;
// The ladder as the next round finds it after a loss, an abandoned round or a 0-point win.
export const LADDER_RESET = Object.freeze({ rung: 0, next: 'apprentice', minLength: MIN_WORD_LENGTH });

export const countWords = (round, knowledge) => filterCandidates(toPublicState(round), knowledge.words).length;

// Her knowledge for this round. With a ticket, her memory of the player (C2's brain: their letter
// habits, her personality, words that beat her) joins it; the voice data never does.
export function knowledgeFor(entries, tier, ticket, length) {
  if (ticket?.memory?.brain) {
    try { return createKnowledge(entries, tier.maxSize, commonnessWeight, toBrain(ticket.memory.brain, length)); } catch { /* play without memory */ }
  }
  return createKnowledge(entries, tier.maxSize);
}

// assets: { entries, questions: { labels, categories } | null }. Without labels she asks nothing.
// ticket: the server's round (seed, points, ladder, memory), or null when it could not start.
export function createSession(word, assets, tier, ticket = null) {
  return {
    round: createRound(word), assets, entries: assets.entries, questions: assets.questions,
    knowledge: knowledgeFor(assets.entries, tier, ticket, word.length), tier,
    // The server's round seed; a local one when the duel is not scored.
    seed: ticket ? ticket.seed : newLocalSeed(),
    ticket, points: ticket?.points ?? null,
    // Experimental mode: AI questions instead of WordNet ones, while the server allows them.
    experimental: Boolean(ticket?.experimental), aiLeft: MAX_QUESTIONS, aiTriedAt: -1, leanings: [],
    // Questions offered so far ({ code, answer }), the guess count when she last asked, the
    // answers that were checked against WordNet and right (they earn the bonus), and the open one.
    offers: [], askedAt: -1, verified: 0, pending: null,
  };
}

// Her vocabulary after the questions answered so far (unknown words stay on both sides). In
// experimental mode, each answered AI question makes the words its model sorted to that side
// weigh more; no word is ruled out, because the model's sort can be wrong.
export function herKnowledge(session) {
  const narrowed = session.questions && !session.experimental
    ? narrowKnowledge(session.knowledge, session.questions.labels, session.offers, session.questions.categories) : session.knowledge;
  if (!session.leanings?.length) return narrowed;
  const weights = new Map(narrowed.weights);
  for (const { side } of session.leanings) for (const word of side) if (weights.has(word)) weights.set(word, weights.get(word) * AI_LEAN);
  return Object.freeze({ ...narrowed, weights });
}

// Her question (v2 E2): chosen from public state, her vocabulary, the public labels and her
// seed. Only after she chose does game code look at the secret, to say whether the answer
// can be checked.
function ask(session, question) {
  const checkable = checkAnswer(session.questions.labels, session.round.answer, question.code) !== null;
  return { ...session, askedAt: session.round.guesses.length, pending: { question, checkable } };
}

// Her turn: an AI consult or a question if one qualifies (at most one per letter guessed),
// otherwise a letter from public state only. Returns { type, session, ... }:
// - 'consult': ask her AI helper about `candidates` (sorted); then applyConsult.
// - 'question': session.pending holds her question; then answerQuestion.
// - 'letter': the guess is applied; decision is her record, positions the tiles it filled,
//   share the percentage the page quotes, countBefore/countAfter her candidates around it.
// - 'error': the solver failed; the session is unchanged.
export function takeTurn(session) {
  const state = toPublicState(session.round);
  const guessed = session.round.guesses.length;
  if (session.experimental && session.ticket && session.aiLeft > 0 && session.aiTriedAt < guessed && session.askedAt < guessed && guessed >= EARLIEST_TURN) {
    const candidates = filterCandidates(state, herKnowledge(session).words);
    if (candidates.length >= 2 && candidates.length <= AI_MAX_CANDIDATES) {
      return { type: 'consult', candidates: [...candidates].sort(), session: { ...session, aiTriedAt: guessed } };
    }
  }
  if (session.questions && !session.experimental && session.askedAt < guessed) {
    let question = null;
    try {
      question = chooseQuestion(state, session.knowledge, session.questions.labels, session.questions.categories, session.offers, { seed: session.seed });
    } catch { question = null; }
    if (question) return { type: 'question', question, session: ask(session, question) };
  }
  const knowledge = herKnowledge(session);
  let decision;
  try { decision = analyzeDecision(state, knowledge, { seed: session.seed }); } catch { return { type: 'error', session }; }
  const { letter } = decision;
  const round = applyGuess(session.round, letter);
  if (!letter || round === session.round) return { type: 'error', session };
  const before = getPattern(session.round);
  const after = getPattern(round);
  const positions = after.flatMap((value, index) => (value === letter && before[index] === null ? [index] : []));
  const share = decision.fallback
    // The fallback counts letters over her whole tier at this length, unnarrowed.
    ? Math.round(session.knowledge.frequency[letter] / Math.max(1, session.knowledge.words.length) * 100)
    : Math.round(decision.hitCount / decision.candidateCount * 100);
  return { type: 'letter', session: { ...session, round }, decision, letter, positions, share,
    countBefore: decision.candidateCount, countAfter: countWords(round, knowledge) };
}

// Her helper's reply: { ok: true, question, yes, no } puts a question to the player (pending),
// anything else is a failure and she makes her normal move next.
export function applyConsult(session, reply) {
  const turn = session.round.guesses.length;
  // The server's count, never more than she has left: each question she asks uses one.
  const server = Number.isInteger(reply.questionsLeft) ? reply.questionsLeft : session.aiLeft;
  const aiLeft = Math.min(server, reply.ok ? session.aiLeft - 1 : session.aiLeft);
  if (!reply.ok) return { ...session, aiLeft };
  return { ...session, aiLeft, askedAt: turn,
    pending: { ai: true, checkable: false, question: { question: reply.question, yes: reply.yes, no: reply.no } } };
}

// The player answers her open question: 'yes', 'no' or 'declined'. Returns null when there is
// nothing to answer. An AI question cannot be checked and earns nothing; an answer makes her
// lean that way. A known word's answer is checked: a wrong one is corrected and she filters on
// the archive's answer. An unknown word's answer is taken on trust, with no bonus.
// outcome: 'declined' | 'answered' (AI) | 'confirmed' | 'corrected' | 'unchecked'.
export function answerQuestion(session, answer) {
  if (!session.pending || !['yes', 'no', 'declined'].includes(answer)) return null;
  const { question } = session.pending;
  if (session.pending.ai) {
    const declined = answer === 'declined';
    const side = answer === 'yes' ? question.yes : question.no;
    return { outcome: declined ? 'declined' : 'answered', truth: null, ai: true,
      session: { ...session, pending: null, leanings: declined ? session.leanings : [...session.leanings, { side }] } };
  }
  const truth = checkAnswer(session.questions.labels, session.round.answer, question.code);
  let outcome = 'declined';
  let recorded = 'declined';
  if (answer !== 'declined') {
    outcome = truth === null ? 'unchecked' : truth === answer ? 'confirmed' : 'corrected';
    recorded = truth ?? answer;
  }
  return { outcome, truth, ai: false, session: { ...session, offers: [...session.offers, { code: question.code, answer: recorded }],
    verified: session.verified + (outcome === 'confirmed' ? 1 : 0), pending: null } };
}

// What a win pays now: the server's stump points, with the multiplier for answers that were
// checked and right (a preview; the claim's award is the server's). `extra` previews more.
export const previewPoints = (session, extra = 0) => (session.points?.eligible
  ? illuciaStumpPoints(session.tier.id, session.round.answer.length, session.verified + extra) : 0);

// What answering her open question is worth, said before the player chooses.
export function offerStake(session) {
  const { pending } = session;
  if (pending.ai) return 'An AI question earns nothing and cannot be checked. Answering helps her a little; declining tells her nothing.';
  if (!pending.checkable) return 'My archive does not know your word, so your answer cannot be checked: no bonus possible for this word.';
  return session.points?.eligible
    ? `Answer correctly and still win: ${previewPoints(session)} → ${previewPoints(session, 1)} points. Declining tells her nothing.`
    : 'Answering helps her. Declining tells her nothing.';
}

// Whether a win in this round would climb the ladder (a preview of the server's rule).
export function ladderStep(ladder, tier, length) {
  if (!ladder) return null;
  if (tier.id === 'apprentice') return ladder.rung === 0 ? 'start' : null;
  return ladder.rung > 0 && tier.id === ladder.next && length >= ladder.minLength ? (ladder.rung === 2 ? 'top' : 'climb') : null;
}

// What this round is worth, said once at the start: { from: 'stakes' | 'illucia', text }.
export function roundStakes(ticket, tier, length) {
  if (!ticket) return { from: 'stakes', text: 'This duel is not scored: the scorekeeper could not be reached.' };
  const { points } = ticket;
  if (points.reason === ILLUCIA_NO_POINTS.experimental) {
    return { from: 'stakes', text: 'Experimental mode: I may ask my AI helper for questions. This duel earns no points.' };
  }
  if (points.reason === ILLUCIA_NO_POINTS.alreadyWon) return { from: 'illucia', text: ILLUCIA_ALREADY_WON_MESSAGE };
  if (points.reason === ILLUCIA_NO_POINTS.outsideTier) {
    return { from: 'stakes', text: `${tier.label} does not know this word, so this duel earns no points.` };
  }
  if (!points.eligible) return { from: 'stakes', text: 'This duel earns no points.' };
  const step = ladderStep(ticket.ladder, tier, length);
  const ladder = step === 'top' ? ' Win, and your ladder is complete: +100.'
    : step === 'climb' ? ` This is rung ${ticket.ladder.rung + 1} of 3 on your ladder.`
      : step === 'start' ? ' A win starts your ladder.' : '';
  return { from: 'stakes', text: `A win is worth ${points.stump} points.${ladder}` };
}

// Before a word is committed: does it pay, and does it keep the ladder? (A preview from the
// player's stats; the server decides.)
export function startWarning(word, entries, tier, ladder, spent, experimental) {
  if (experimental) return '';
  const notes = [];
  const size = entries.find(entry => entry.word === word)?.size ?? 70;
  const outside = size > tier.maxSize;
  if (outside) notes.push(`${tier.label} does not know this word: you can still win, but it earns no points.`);
  else if (spent.has(word)) notes.push(ILLUCIA_ALREADY_WON_MESSAGE);
  const pays = !outside && !spent.has(word);
  if (ladder?.rung > 0 && (!pays || tier.id !== ladder.next || word.length < ladder.minLength)) {
    notes.push(`This resets your ladder (next rung: ${tierLabel(ladder.next)} with ${ladder.minLength}+ letters).`);
  }
  return notes.join(' ');
}

// Her memory of this word, once it is out: learned from this player, or played before. Null when
// she has nothing to remember.
export const rememberLine = (session, playerWon) => memoryLine({ word: session.round.answer,
  learnedIt: session.knowledge.learned.has(session.round.answer), playerWon, voice: session.ticket?.memory?.voice });
