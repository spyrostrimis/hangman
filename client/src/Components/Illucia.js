import React, { useEffect, useMemo, useRef, useState } from 'react';
import RegisteredOnly from './RegisteredOnly';
import { useAuth } from './AuthProvider';
import { applyGuess, createRound, getPattern, getRemainingMisses, getRoundStatus, MAX_MISSES } from '../lib/hangman-core.js';
import { MAX_WORD_LENGTH, MIN_WORD_LENGTH, VOCABULARY_TIERS, commonnessWeight, createKnowledge, isAcceptedWord, isWordShape, parseLexicon } from '../lib/illucia/lexicon.js';
import { toBrain } from '../lib/illucia/brain.js';
import { toPublicState } from '../lib/illucia/public-state.js';
import { filterCandidates } from '../lib/illucia/candidates.js';
import { analyzeDecision } from '../lib/illucia/strategy.js';
import { newLocalSeed } from '../lib/illucia/random.js';
import { checkAnswer, chooseQuestion, narrowKnowledge, parseCategories, parseLabels } from '../lib/illucia/questions.js';
import { rejectionLine } from '../lib/illucia/lines.js';
import { greetingLine, openingLine } from '../lib/illucia/observatory-lines.js';
import { ANSWERS, REPLIES, answerLine, askLine, questionLine, questionNote, reasonLine, replyLine, solvedLine } from '../lib/illucia/duel-lines.js';
import { claimIlluciaRound, loadIlluciaStats, startIlluciaRound } from '../lib/illucia-rounds.js';
import { ILLUCIA_ALREADY_WON_MESSAGE, ILLUCIA_NO_POINTS, illuciaStumpPoints } from '../../../shared/scoring-protocol.js';
import './Illucia.css';

// Play vs AI as a conversation that scrolls down: Illucia asks for a letter,
// the player shows her where it goes (or answers a miss), and she carries on.
// Game code decides every hit and miss; the player's replies are only words.

const THINK_MS = 1100;
// Vocabulary and temperament (lexicon.js): Apprentice has the widest shortlist, Master the narrowest.
const TIER_NOTES = {
  apprentice: 'Common words only. Plays on hunches.',
  scholar: 'Everyday and less common words. A little more careful.',
  master: 'Every word she accepts. The most careful.',
};

export default function Illucia() {
  const { user, status, refresh } = useAuth();
  if (status === 'loading') return <p role="status">Checking your session…</p>;
  if (status === 'error') return <div className="duel-page"><p>Cannot check your session right now.</p><button onClick={refresh}>Try again</button></div>;
  if (!user) return <RegisteredOnly from="/illucia" />;
  return <DuelPage key={user.id} userId={user.id} username={user.username} />;
}

const tierLabel = id => VOCABULARY_TIERS.find(tier => tier.id === id)?.label ?? id;
// The ladder as the next round finds it after a loss, an abandoned round or a 0-point win.
const LADDER_RESET = Object.freeze({ rung: 0, next: 'apprentice', minLength: MIN_WORD_LENGTH });

// What a win pays now: the server's stump points, with the multiplier for answers that were
// checked and right (a preview; the claim's award is the server's).
const previewPoints = duel => (duel.points?.eligible ? illuciaStumpPoints(duel.tier.id, duel.round.answer.length, duel.verified) : 0);

// Whether a win in this round would climb the ladder (a preview of the server's rule).
function ladderStep(ladder, tier, length) {
  if (!ladder) return null;
  if (tier.id === 'apprentice') return ladder.rung === 0 ? 'start' : null;
  return ladder.rung > 0 && tier.id === ladder.next && length >= ladder.minLength ? (ladder.rung === 2 ? 'top' : 'climb') : null;
}

const countWords = (round, knowledge) => filterCandidates(toPublicState(round), knowledge.words).length;

// Her vocabulary after the questions answered so far (unknown words stay on both sides).
const herKnowledge = duel => (duel.questions
  ? narrowKnowledge(duel.knowledge, duel.questions.labels, duel.offers, duel.questions.categories) : duel.knowledge);

// Her knowledge for this round. With a ticket, her memory of the player (C2's brain: their letter
// habits, her personality, words that beat her) joins it; the voice data never does.
function knowledgeFor(entries, tier, ticket, length) {
  if (ticket?.memory?.brain) {
    try { return createKnowledge(entries, tier.maxSize, commonnessWeight, toBrain(ticket.memory.brain, length)); } catch { /* play without memory */ }
  }
  return createKnowledge(entries, tier.maxSize);
}

// What this round is worth, said once at the start.
function stakesLog(ticket, tier, length) {
  if (!ticket) return [{ type: 'stakes', text: 'This duel is not scored: the scorekeeper could not be reached.' }];
  const { points } = ticket;
  if (points.reason === ILLUCIA_NO_POINTS.alreadyWon) return [{ type: 'illucia', text: ILLUCIA_ALREADY_WON_MESSAGE }];
  if (points.reason === ILLUCIA_NO_POINTS.outsideTier) {
    return [{ type: 'stakes', text: `${tier.label} does not know this word, so this duel earns no points.` }];
  }
  if (!points.eligible) return [{ type: 'stakes', text: 'This duel earns no points.' }];
  const step = ladderStep(ticket.ladder, tier, length);
  const ladder = step === 'top' ? ' Win, and your ladder is complete: +100.'
    : step === 'climb' ? ` This is rung ${ticket.ladder.rung + 1} of 3 on your ladder.`
      : step === 'start' ? ' A win starts your ladder.' : '';
  return [{ type: 'stakes', text: `A win is worth ${points.stump} points.${ladder}` }];
}

// assets: { entries, questions: { labels, categories } | null }. Without labels she asks nothing.
// ticket: the server's round (seed, points, ladder, memory), or null when it could not start.
function newDuel(word, assets, tier, ticket = null) {
  const knowledge = knowledgeFor(assets.entries, tier, ticket, word.length);
  const round = createRound(word);
  return {
    // The server's round seed; a local one when the duel is not scored.
    round, assets, entries: assets.entries, questions: assets.questions, knowledge, tier, seed: ticket ? ticket.seed : newLocalSeed(),
    ticket, points: ticket?.points ?? null,
    phase: 'thinking', lastGuess: null, lastHit: null,
    // Questions offered so far ({ code, answer }), the guess count when she last asked, and the
    // answers that were checked against WordNet and right (they earn the bonus).
    offers: [], askedAt: -1, verified: 0, pending: null,
    log: [
      { type: 'player', text: `My word is ready: ${word.length} letters. You get the ${tier.label} vocabulary.` },
      { type: 'illucia', text: openingLine(word.length, countWords(round, knowledge)) },
      ...stakesLog(ticket, tier, word.length),
      { type: 'board', pattern: getPattern(round), hidden: [], revealed: [], caption: 'Start' },
    ],
  };
}

function failed(duel) {
  return { ...duel, phase: 'error', log: [...duel.log, { type: 'illucia', text: 'Something went wrong in my notes. Let us start again with a new word.' }] };
}

// Her question (v2 E2): chosen from public state, her vocabulary, the public labels and her
// seed. Only after she chose does game code look at the secret, to say whether the answer
// can be checked.
function ask(duel, question) {
  const turn = duel.round.guesses.length;
  const checkable = checkAnswer(duel.questions.labels, duel.round.answer, question.code) !== null;
  return { ...duel, phase: 'question', askedAt: turn, pending: { question, checkable },
    log: [...duel.log, { type: 'illucia', text: questionLine(question, turn), note: questionNote(question) }] };
}

// The player answers or declines. A known word's answer is checked: a wrong one is corrected and
// she filters on the archive's answer. An unknown word's answer is taken on trust, with no bonus.
function answer(duel, choiceId) {
  const choice = ANSWERS.find(value => value.id === choiceId);
  if (duel.phase !== 'question' || !choice) return duel;
  const { question } = duel.pending;
  const turn = duel.round.guesses.length;
  const truth = checkAnswer(duel.questions.labels, duel.round.answer, question.code);
  let outcome = 'declined';
  let recorded = 'declined';
  if (choice.id !== 'declined') {
    outcome = truth === null ? 'unchecked' : truth === choice.id ? 'confirmed' : 'corrected';
    recorded = truth ?? choice.id;
  }
  const next = { ...duel, offers: [...duel.offers, { code: question.code, answer: recorded }],
    verified: duel.verified + (outcome === 'confirmed' ? 1 : 0), pending: null, phase: 'thinking', lastHit: null };
  return { ...next, log: [...duel.log, { type: 'player', text: choice.text },
    { type: 'illucia', text: answerLine(outcome, turn, truth) }] };
}

// Her turn: a question if one qualifies (at most one per letter guessed), otherwise a letter
// from public state only. Then she waits for the player.
function guess(duel) {
  const state = toPublicState(duel.round);
  if (duel.questions && duel.askedAt < duel.round.guesses.length) {
    let question = null;
    try {
      question = chooseQuestion(state, duel.knowledge, duel.questions.labels, duel.questions.categories, duel.offers, { seed: duel.seed });
    } catch { question = null; }
    if (question) return ask(duel, question);
  }
  const knowledge = herKnowledge(duel);
  let decision;
  try { decision = analyzeDecision(state, knowledge, { seed: duel.seed }); } catch { return failed(duel); }
  const { letter } = decision;
  const round = applyGuess(duel.round, letter);
  if (!letter || round === duel.round) return failed(duel);
  const before = getPattern(duel.round);
  const after = getPattern(round);
  const positions = after.flatMap((value, index) => (value === letter && before[index] === null ? [index] : []));
  const L = letter.toUpperCase();
  const share = decision.fallback
    // The fallback counts letters over her whole tier at this length, unnarrowed.
    ? Math.round(duel.knowledge.frequency[letter] / Math.max(1, duel.knowledge.words.length) * 100)
    : Math.round(decision.hitCount / decision.candidateCount * 100);
  const note = reasonLine({ letter, share, candidates: decision.candidateCount, fallback: decision.fallback,
    tierLabel: duel.tier.label, length: state.length, decision });
  const turn = round.guesses.length;
  // hunch: she chose a letter below her best, so no line may call it the statistically smart move.
  const lastGuess = { letter, positions, share, hunch: decision.choseBest === false,
    countBefore: decision.candidateCount, countAfter: countWords(round, knowledge) };
  const log = [...duel.log, { type: 'illucia', text: askLine(letter, turn, duel.lastHit), note }];
  if (positions.length) {
    return { ...duel, round, lastGuess, phase: 'reveal',
      log: [...log, { type: 'board', pattern: before, letter, hidden: positions, revealed: [], caption: `Turn ${turn} · ${L} · hit` }] };
  }
  return { ...duel, round, lastGuess, phase: 'reply', log };
}

// The player shows her one tile. When every tile is shown, she continues.
function reveal(duel, index) {
  const board = duel.log.at(-1);
  if (duel.phase !== 'reveal' || board.type !== 'board' || !board.hidden.includes(index) || board.revealed.includes(index)) return duel;
  const updated = { ...board, revealed: [...board.revealed, index] };
  const log = [...duel.log.slice(0, -1), updated];
  if (updated.revealed.length < updated.hidden.length) return { ...duel, log };
  if (getRoundStatus(duel.round) === 'solved') {
    return { ...duel, phase: 'over', log: [...log, { type: 'illucia', text: solvedLine(duel.round.answer, duel.round.guesses.length) }] };
  }
  const { countBefore, countAfter, share } = duel.lastGuess;
  return { ...duel, log, phase: 'thinking',
    lastHit: { positions: updated.hidden.length, share, single: countAfter === 1 && countBefore > 1 } };
}

// The player answers a miss; she answers back, and the unchanged row follows.
function reply(duel, replyId) {
  const choice = REPLIES.find(value => value.id === replyId);
  if (duel.phase !== 'reply' || !choice) return duel;
  const { letter, share, countAfter, hunch } = duel.lastGuess;
  const missesLeft = getRemainingMisses(duel.round);
  const turn = duel.round.guesses.length;
  const answer = replyLine(replyId, { letter, turn, count: countAfter, share, length: duel.round.answer.length, missesLeft, hunch });
  const over = getRoundStatus(duel.round) === 'failed';
  const log = [...duel.log, { type: 'player', text: choice.text }, { type: 'illucia', text: answer },
    { type: 'board', pattern: getPattern(duel.round), hidden: [], revealed: [], final: over,
      caption: `Turn ${turn} · ${letter.toUpperCase()} · miss` }];
  return { ...duel, log, phase: over ? 'over' : 'thinking', lastHit: null };
}

function Avatar() {
  return <span className="duel-avatar" aria-hidden="true" />;
}

function Message({ from, children, note }) {
  return <div className={`duel-msg from-${from}`}>
    {from === 'illucia' && <Avatar />}
    <div className="duel-bubble">
      <span className="hm-sr">{from === 'illucia' ? 'Illucia: ' : 'You: '}</span>
      <p>{children}</p>
      {note && <small>{note}</small>}
    </div>
  </div>;
}

function Board({ entry, answer, active, onReveal }) {
  const letter = entry.letter?.toUpperCase();
  const tiles = entry.pattern.map((value, index) => {
    if (entry.hidden.includes(index)) {
      if (entry.revealed.includes(index)) return { kind: 'revealed', text: letter };
      return { kind: 'hidden', text: '' };
    }
    if (value) return { kind: 'known', text: value.toUpperCase() };
    if (entry.final) return { kind: 'missed', text: answer[index].toUpperCase() };
    return { kind: 'blank', text: '' };
  });
  const spoken = tiles.map(tile => (tile.kind === 'hidden' ? 'hidden' : tile.text || 'blank')).join(' ');
  return <div className={`duel-board ${active ? 'is-active' : ''}`}>
    <span className="duel-board-caption">{entry.caption}</span>
    <div className="duel-tiles" style={{ '--len': tiles.length }} role={active ? 'group' : 'img'} aria-label={`Word: ${spoken}`}>
      {tiles.map((tile, index) => tile.kind === 'hidden'
        ? <button key={index} type="button" className="duel-tile hidden" disabled={!active}
          onClick={() => onReveal(index)} aria-label={`Show ${letter} at position ${index + 1}`} />
        : <span key={index} className={`duel-tile ${tile.kind}`} aria-hidden="true">{tile.text}</span>)}
    </div>
    {active && <p className="duel-hint">Show Illucia where {letter} goes: tap the grey {entry.hidden.length - entry.revealed.length === 1 ? 'tile' : 'tiles'}.</p>}
  </div>;
}

// Her question labels for one length (v2 B1). Questions are optional: if they cannot load,
// she plays letters only.
async function loadQuestions(length, options) {
  try {
    const [labelsResponse, categoriesResponse] = await Promise.all([
      fetch(`/illucia/labels/${length}.txt`, options), fetch('/illucia/labels/categories.json', options)]);
    if (!labelsResponse.ok || !categoriesResponse.ok) return null;
    const categories = parseCategories(await categoriesResponse.json());
    return { categories, labels: parseLabels(await labelsResponse.text(), length, categories) };
  } catch {
    return null;
  }
}

function LadderNote({ ladder }) {
  if (!ladder) return null;
  const text = ladder.rung === 0
    ? 'Ladder: beat Apprentice, then Scholar, then Master in a row, each word longer, for +100.'
    : `Ladder: next, ${tierLabel(ladder.next)} with a word of ${ladder.minLength}+ letters. +100 at the top.`;
  return <div className="duel-ladder" aria-label={`Ladder: ${ladder.rung} of 3 rungs climbed`}>
    <ol aria-hidden="true">{VOCABULARY_TIERS.map((tier, index) =>
      <li key={tier.id} className={index < ladder.rung ? 'done' : index === ladder.rung ? 'next' : ''}>{tier.label}</li>)}</ol>
    <p className="duel-muted">{text}</p>
  </div>;
}

// Before a word is committed: does it pay, and does it keep the ladder? (A preview from the
// player's stats; the server decides.)
function startWarning(word, entries, tier, ladder, spent) {
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

function Composer({ onStart, ladder, spent }) {
  const [secret, setSecret] = useState('');
  const [tierId, setTierId] = useState(ladder?.rung > 0 ? ladder.next : 'scholar');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState(null); // { key, text }: a second press starts anyway
  const [loading, setLoading] = useState(false);
  const pending = useRef(null);
  const chosen = useRef(false);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);
  // The ladder may arrive after the form: offer its next rung unless the player already chose.
  useEffect(() => { if (!chosen.current && ladder?.rung > 0) setTierId(ladder.next); }, [ladder]);
  const key = `${secret.trim().toLowerCase()}:${tierId}`;
  const warned = warning?.key === key;

  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    const word = secret.trim().toLowerCase();
    if (!isWordShape(word)) {
      setError(`Choose ${MIN_WORD_LENGTH}–${MAX_WORD_LENGTH} letters, A–Z only, with no spaces or punctuation.`);
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError('');
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      // The word lists and labels are static files: only the length is in these requests.
      const options = { signal: controller.signal };
      const [response, questions] = await Promise.all([
        fetch(`/illucia/words/${word.length}.txt`, options),
        loadQuestions(word.length, options),
      ]);
      if (!response.ok) throw new Error('Vocabulary unavailable');
      const entries = parseLexicon(await response.text(), word.length);
      if (controller.signal.aborted) return;
      if (!isAcceptedWord(word, entries)) {
        setError(rejectionLine(word.length));
        return;
      }
      const tier = VOCABULARY_TIERS.find(value => value.id === tierId);
      const note = startWarning(word, entries, tier, ladder, spent);
      if (note && warning?.key !== `${word}:${tier.id}`) {
        setWarning({ key: `${word}:${tier.id}`, text: note });
        return;
      }
      clearTimeout(timeout);
      // Starting a round sends the word to the server (see /privacy).
      await onStart(word, { entries, questions }, tier);
    } catch {
      if (pending.current === controller) setError('The vocabulary could not load. Please try again.');
    } finally {
      clearTimeout(timeout);
      if (pending.current === controller) { pending.current = null; setLoading(false); }
    }
  }

  return <form className="duel-composer" onSubmit={submit}>
    <fieldset disabled={loading}>
      <label className="duel-label" htmlFor="duel-secret">Your secret word</label>
      {/* Not type="password": browsers would offer to save and sync the word as a credential. */}
      <input id="duel-secret" type="text" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} maxLength={15}
        value={secret} onChange={event => setSecret(event.target.value)} aria-describedby="duel-trust duel-validation" aria-invalid={Boolean(error)} />
      <p id="duel-trust" className="duel-muted">{secret.trim() ? `${secret.trim().length} letters · ` : ''}Her guessing sees only the blanks. The server keeps your word to check the result.</p>
      <p id="duel-validation" role="alert">{error}</p>
      <LadderNote ladder={ladder} />
      <div className="duel-tiers" role="radiogroup" aria-label="Her vocabulary">
        {VOCABULARY_TIERS.map(tier => <label key={tier.id} className={tierId === tier.id ? 'selected' : ''}>
          <input type="radio" name="duel-tier" value={tier.id} checked={tierId === tier.id}
            onChange={() => { chosen.current = true; setTierId(tier.id); }} />
          <b>{tier.label}</b>
          <small>{TIER_NOTES[tier.id]}</small>
        </label>)}
      </div>
      {warned && <p className="duel-warning" role="status">{warning.text}</p>}
      <button type="submit" className="hm-button primary">{warned ? 'Start anyway' : 'Start the duel'}</button>
    </fieldset>
    {loading && <p role="status">Loading her {secret.trim().length}-letter words…</p>}
  </form>;
}

// Her question is a bet: answering helps her, declining tells her nothing. When WordNet does
// not know the player's word, the answer cannot be checked, and the card says so first.
function Offer({ duel, onAnswer }) {
  const { pending } = duel;
  const now = previewPoints(duel);
  const next = duel.points?.eligible ? illuciaStumpPoints(duel.tier.id, duel.round.answer.length, duel.verified + 1) : 0;
  const stake = !pending.checkable
    ? 'My archive does not know your word, so your answer cannot be checked: no bonus possible for this word.'
    : duel.points?.eligible ? `Answer correctly and still win: ${now} → ${next} points. Declining tells her nothing.`
      : 'Answering helps her. Declining tells her nothing.';
  return <div className="duel-msg from-player">
    <div className="duel-replies duel-offer" role="group" aria-label="Answer her question" aria-describedby="duel-offer-stake">
      <span className="duel-label">Her question · your choice</span>
      <p id="duel-offer-stake" className="duel-stake">{stake}</p>
      {ANSWERS.map(choice => <button key={choice.id} type="button" onClick={() => onAnswer(choice.id)}>{choice.label}</button>)}
    </div>
  </div>;
}

function StatusBar({ duel, restart }) {
  const [confirming, setConfirming] = useState(false);
  const remaining = getRemainingMisses(duel.round);
  // Leaving a scored round counts as a loss and resets the ladder, so it takes a second press.
  const scored = Boolean(duel.ticket) && duel.phase !== 'over' && duel.phase !== 'error';
  const points = !duel.ticket ? 'Not scored' : duel.points?.eligible ? `${previewPoints(duel)} pts` : 'No points';
  const knowledge = useMemo(() => herKnowledge(duel), [duel.knowledge, duel.questions, duel.offers]);
  const current = useMemo(() => countWords(duel.round, knowledge), [duel.round, knowledge]);
  // Until the player shows her the tiles, she only knows what she knew before the guess.
  const words = duel.phase === 'reveal' ? duel.lastGuess.countBefore : current;
  return <div className="duel-status">
    <div className="duel-status-cells" role="img" aria-label={`Her chances: ${remaining} of ${MAX_MISSES}`}>
      <span className="hm-label">Her chances</span>
      <div className="hm-cells">{Array.from({ length: MAX_MISSES }, (_, index) => <span key={index} className={index < remaining ? 'on' : ''} />)}</div>
    </div>
    <div className="duel-status-facts">
      <span className="duel-chip">{duel.tier.label}</span>
      <span><small>Words in mind</small><b>{words.toLocaleString('en-US')}</b></span>
      <span className="duel-your-word"><small>Your word</small><b>{duel.round.answer.toUpperCase()}</b></span>
      <span className="duel-points" aria-label={`Points: ${points}`}>{points}</span>
    </div>
    <button type="button" className="duel-new" onClick={() => (scored && !confirming ? setConfirming(true) : restart())}>
      {scored && confirming ? 'Leave? Counts as a loss' : 'New word'}</button>
  </div>;
}

function ClaimSummary({ duel, claim, retry }) {
  if (!duel.ticket) return <p className="duel-muted">This duel was not scored.</p>;
  if (!claim || claim.saving) return <p role="status">Saving…</p>;
  if (claim.error) return <>
    <p role="alert">{claim.error}</p>
    {claim.canRetry && <button type="button" className="hm-button" onClick={retry}>Retry saving</button>}
  </>;
  const { awarded, score, reason, ladder } = claim.result;
  let points;
  if (awarded.stump > 0) {
    const ladderPart = awarded.ladder > 0 ? `, and +${awarded.ladder} for completing your ladder` : '';
    points = `+${awarded.stump} points${ladderPart}. Your total is ${score.toLocaleString('en-US')}.`;
  } else if (reason === ILLUCIA_NO_POINTS.alreadyWon) points = ILLUCIA_ALREADY_WON_MESSAGE;
  else if (reason === ILLUCIA_NO_POINTS.outsideTier) points = `${duel.tier.label} does not know ${duel.round.answer.toUpperCase()}, so this win earns no points.`;
  else points = 'This win earns no points.';
  return <>
    <p className="duel-award" role="status">{points}</p>
    {ladder?.rung > 0 && <p className="duel-muted">Ladder: next, {tierLabel(ladder.next)} with a word of {ladder.minLength}+ letters.</p>}
  </>;
}

function Result({ duel, claim, spent, restart, rematch, retry }) {
  const status = getRoundStatus(duel.round);
  const misses = MAX_MISSES - getRemainingMisses(duel.round);
  const guesses = duel.round.guesses.length;
  const nextTier = VOCABULARY_TIERS[VOCABULARY_TIERS.indexOf(duel.tier) + 1];
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const climb = status === 'failed' && claim?.result?.ladder?.rung > 0 ? claim.result.ladder : null;
  // Once a word has paid, the same word earns nothing at any level, and a 0-point win resets the ladder.
  const practice = spent.has(duel.round.answer);
  return <section className="hm-screen duel-result" aria-labelledby="duel-result-title">
    <div className="hm-screen-inner">
      <h2 id="duel-result-title" ref={heading} tabIndex={-1}>{status === 'solved' ? 'Illucia wins' : 'You win'}</h2>
      <p>The word was <strong>{duel.round.answer.toUpperCase()}</strong>.</p>
      <p>{guesses} guesses: {guesses - misses} {guesses - misses === 1 ? 'hit' : 'hits'}, {misses} {misses === 1 ? 'miss' : 'misses'}.</p>
      {status === 'failed' && <ClaimSummary duel={duel} claim={claim} retry={retry} />}
      {status === 'solved' && duel.ticket && <p className="duel-muted">No points this time.{duel.ticket.ladder?.rung > 0 ? ' Your ladder resets.' : ''}</p>}
      <div className="duel-result-actions">
        <button type="button" className="hm-button primary" onClick={restart}>
          {climb ? `Climb to ${tierLabel(climb.next)} (${climb.minLength}+ letters)` : 'Play again'}</button>
        {status === 'failed' && nextTier && <button type="button" className="hm-button" onClick={() => rematch(nextTier)}>
          Rematch vs {nextTier.label}{practice ? ' (practice, 0 points)' : ''}</button>}
      </div>
    </div>
  </section>;
}

function DuelPage({ userId, username }) {
  const { updateScore, expireSession } = useAuth();
  const [duel, setDuel] = useState(null);
  const [ladder, setLadder] = useState(null);
  const [spent, setSpent] = useState(() => new Set());
  const [claim, setClaim] = useState(null);
  const bottom = useRef(null);
  const mounted = useRef(true);
  const openRound = useRef(null); // a started round not yet claimed: the next start abandons it
  const active = useRef(null);
  active.current = duel;
  const greeting = useMemo(() => greetingLine(username?.length ?? 0), [username]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // The ladder and the words that already paid, so the form can warn before a word is committed.
  useEffect(() => {
    const controller = new AbortController();
    loadIlluciaStats({ signal: controller.signal }).then(stats => {
      if (stats.ladder) setLadder(stats.ladder);
      if (stats.spent) setSpent(new Set(stats.spent));
    }).catch(() => {});
    return () => controller.abort();
  }, []);

  // Her turn runs once per thinking pause. The guess is computed here, not in
  // a state updater, so StrictMode's double-invoked updaters never run the solver twice.
  useEffect(() => {
    if (duel?.phase !== 'thinking') return;
    const timer = setTimeout(() => setDuel(guess(duel)), THINK_MS);
    return () => clearTimeout(timer);
  }, [duel]);

  // Keep the newest exchange in view as the conversation grows downwards.
  useEffect(() => {
    if (!duel) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    bottom.current?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'end' });
  }, [duel?.log.length, duel?.phase]);

  async function begin(word, assets, tier) {
    let ticket = null;
    try {
      ticket = await startIlluciaRound({ word, tier: tier.id, previousRoundId: openRound.current });
    } catch (error) {
      if (error.status === 401) { expireSession(userId); return; }
    }
    if (!mounted.current) return;
    // A new scored round abandons the open one, which resets the ladder.
    if (ticket && openRound.current && openRound.current !== ticket.roundId) setLadder(LADDER_RESET);
    openRound.current = ticket?.roundId ?? openRound.current;
    setClaim(null);
    setDuel(newDuel(word, assets, tier, ticket));
  }

  async function save(round) {
    const { ticket } = round;
    setClaim({ roundId: ticket.roundId, saving: true });
    try {
      const result = await claimIlluciaRound(ticket, round.round.guesses, round.verified,
        { stillWanted: () => mounted.current && active.current === round });
      if (!result || !mounted.current) return;
      updateScore(userId, result.score);
      setLadder(result.ladder ?? LADDER_RESET);
      if (result.awarded.stump > 0 || result.reason === ILLUCIA_NO_POINTS.alreadyWon) {
        setSpent(current => new Set([...current, round.round.answer]));
      }
      if (openRound.current === ticket.roundId) openRound.current = null;
      if (active.current === round) setClaim({ roundId: ticket.roundId, saving: false, result });
    } catch (error) {
      if (!mounted.current) return;
      if (error.status === 401) expireSession(userId);
      if (active.current === round) setClaim({ roundId: ticket.roundId, saving: false,
        canRetry: !error.status || error.status >= 500 || error.status === 429 || error.status === 200,
        error: error.status === 401 ? 'Your session expired, so these points could not be saved.'
          : error.status === 409 ? 'This round can no longer earn points.'
            : 'Could not confirm your points were saved. Retrying is safe.' });
    }
  }

  // The round is over: a win is claimed (the duel no longer changes, so this runs once; a repeated
  // claim would get the stored award back); her win resets the ladder.
  useEffect(() => {
    if (!duel?.ticket || duel.phase !== 'over') return;
    if (getRoundStatus(duel.round) === 'solved') setLadder(LADDER_RESET);
    else void save(duel);
  }, [duel]);

  const restart = () => {
    // Leaving a scored round before it is over abandons it.
    if (duel?.ticket && duel.phase !== 'over') setLadder(LADDER_RESET);
    setDuel(null);
  };
  const lastIndex = duel ? duel.log.length - 1 : -1;
  const claimFor = duel && claim?.roundId === duel.ticket?.roundId ? claim : null;

  return <div className="duel-page">
    <header className="duel-heading">
      <h1 className="hm-title">Illucia</h1>
      <p className="hm-subtitle">Play vs AI · a duel, letter by letter</p>
    </header>

    {duel && <StatusBar key={duel.ticket?.roundId ?? duel.seed} duel={duel} restart={restart} />}

    <div className="duel-log" role="log" aria-live="polite" aria-relevant="additions">
      <Message from="illucia">Hello, {username}. {greeting} I guess your secret word one letter at a time.</Message>
      {!duel && <div className="duel-msg from-player"><Composer onStart={begin} ladder={ladder} spent={spent} /></div>}
      {duel?.log.map((entry, index) => entry.type === 'board'
        ? <Board key={index} entry={entry} answer={duel.round.answer} active={index === lastIndex && duel.phase === 'reveal'}
          onReveal={position => setDuel(current => reveal(current, position))} />
        : entry.type === 'stakes' ? <p key={index} className="duel-stakes">{entry.text}</p>
          : <Message key={index} from={entry.type} note={entry.note}>{entry.text}</Message>)}
      {duel?.phase === 'thinking' && <div className="duel-msg from-illucia" aria-hidden="true">
        <Avatar /><div className="duel-bubble duel-typing"><span /><span /><span /></div>
      </div>}
      {duel?.phase === 'reply' && <div className="duel-msg from-player">
        <div className="duel-replies" role="group" aria-label="Your reply">
          <span className="duel-label">No {duel.lastGuess.letter.toUpperCase()} in your word. Your reply:</span>
          {REPLIES.map(choice => <button key={choice.id} type="button" onClick={() => setDuel(current => reply(current, choice.id))}>{choice.text}</button>)}
        </div>
      </div>}
      {duel?.phase === 'question' && <Offer duel={duel} onAnswer={id => setDuel(current => answer(current, id))} />}
      {duel?.phase === 'error' && <div className="duel-result-actions"><button type="button" className="hm-button primary" onClick={restart}>New word</button></div>}
    </div>

    {duel?.phase === 'over' && <Result duel={duel} claim={claimFor} spent={spent} restart={restart} retry={() => save(duel)}
      rematch={tier => begin(duel.round.answer, duel.assets, tier)} />}

    <div ref={bottom} className="duel-bottom" />
    <p className="duel-credits">Vocabulary: ESDB/SCOWL · filtered with LDNOOBW · questions: Open English WordNet (CC BY 4.0). <a href="/illucia/credits.html" target="_blank" rel="noreferrer">Credits &amp; licences</a></p>
  </div>;
}
