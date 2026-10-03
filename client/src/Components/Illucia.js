import React, { useEffect, useMemo, useRef, useState } from 'react';
import RegisteredOnly from './RegisteredOnly';
import IlluciaRecord from './IlluciaRecord';
import { useAuth } from './AuthProvider';
import { getPattern, getRemainingMisses, getRoundStatus, MAX_MISSES } from '../lib/hangman-core.js';
import { MAX_WORD_LENGTH, MIN_WORD_LENGTH, VOCABULARY_TIERS, isAcceptedWord, isWordShape, parseLexicon } from '../lib/illucia/lexicon.js';
import { rejectionLine } from '../lib/illucia/lines.js';
import { greetingLine, openingLine } from '../lib/illucia/observatory-lines.js';
import { AI_NOTE, ANSWERS, REPLIES, aiAnswerLine, aiFallbackLine, aiQuestionLine, answerLine, askLine, questionLine, questionNote, reasonLine, replyLine, solvedLine } from '../lib/illucia/duel-lines.js';
import { answerQuestion, applyConsult, countWords, createSession, herKnowledge, offerStake, previewPoints, rememberLine, roundStakes, startWarning, takeTurn, tierLabel } from '../lib/illucia/duel-session.js';
import { loadQuestions } from '../lib/illucia-assets.js';
import { askIlluciaAi } from '../lib/illucia-rounds.js';
import { useIlluciaRounds } from '../lib/use-illucia-rounds.js';
import { ILLUCIA_ALREADY_WON_MESSAGE, ILLUCIA_NO_POINTS } from '../../../shared/scoring-protocol.js';
import './Illucia.css';

// Play vs AI as a conversation that scrolls down: Illucia asks for a letter,
// the player shows her where it goes (or answers a miss), and she carries on.
// Game code decides every hit and miss; the player's replies are only words.
// The duel itself (her knowledge, turns, questions and points) is the session shared with the
// Observatory (lib/illucia/duel-session.js); this page adds the conversation log and its phases.

const THINK_MS = 1100;
const EXPERIMENTAL_WARNING = 'Experimental: Illucia uses an AI model and can make mistakes. No points, and it resets your ladder.';
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

// The shared session plus this page's conversation: its phase and its log.
function newDuel(word, assets, tier, ticket = null) {
  const session = createSession(word, assets, tier, ticket);
  const stakes = roundStakes(ticket, tier, word.length);
  return {
    ...session, consult: null, phase: 'thinking', lastGuess: null, lastHit: null,
    log: [
      { type: 'player', text: `My word is ready: ${word.length} letters. You get the ${tier.label} vocabulary.` },
      { type: 'illucia', text: openingLine(word.length, countWords(session.round, session.knowledge)) },
      { type: stakes.from, text: stakes.text },
      { type: 'board', pattern: getPattern(session.round), hidden: [], revealed: [], caption: 'Start' },
    ],
  };
}

// Her memory of this word, once it is out: learned from this player, or played before.
function remembered(duel, playerWon) {
  const text = rememberLine(duel, playerWon);
  return text ? [{ type: 'illucia', text }] : [];
}

// Her helper's reply: a question to put to the player, or a line owning the failure and her normal move.
function consulted(duel, reply) {
  const turn = duel.round.guesses.length;
  const next = { ...applyConsult(duel, reply), consult: null };
  if (!reply.ok) return { ...next, phase: 'thinking', log: [...duel.log, { type: 'illucia', text: aiFallbackLine(reply.reason, turn) }] };
  return { ...next, phase: 'question', log: [...duel.log, { type: 'illucia', text: aiQuestionLine(reply.question, turn), note: AI_NOTE }] };
}

function failed(duel) {
  return { ...duel, phase: 'error', log: [...duel.log, { type: 'illucia', text: 'Something went wrong in my notes. Let us start again with a new word.' }] };
}

// The player answers or declines her question; she replies.
function answer(duel, choiceId) {
  const choice = ANSWERS.find(value => value.id === choiceId);
  if (duel.phase !== 'question' || !choice) return duel;
  const turn = duel.round.guesses.length;
  const result = answerQuestion(duel, choice.id);
  const line = result.ai ? aiAnswerLine(result.outcome === 'declined', turn) : answerLine(result.outcome, turn, result.truth);
  return { ...result.session, phase: 'thinking', lastHit: null,
    log: [...duel.log, { type: 'player', text: choice.text }, { type: 'illucia', text: line }] };
}

// Her turn (the shared session decides it), told as a message. Then she waits for the player.
function guess(duel) {
  const turn = takeTurn(duel);
  if (turn.type === 'consult') return { ...turn.session, phase: 'consulting', consult: turn.candidates };
  if (turn.type === 'question') {
    return { ...turn.session, phase: 'question',
      log: [...duel.log, { type: 'illucia', text: questionLine(turn.question, duel.round.guesses.length), note: questionNote(turn.question) }] };
  }
  if (turn.type === 'error') return failed(duel);
  const { letter, decision, positions, share, countBefore, countAfter } = turn;
  const { round } = turn.session;
  const L = letter.toUpperCase();
  const note = reasonLine({ letter, share, candidates: decision.candidateCount, fallback: decision.fallback,
    tierLabel: duel.tier.label, length: round.answer.length, decision });
  const count = round.guesses.length;
  // hunch: she chose a letter below her best, so no line may call it the statistically smart move.
  const lastGuess = { letter, positions, share, hunch: decision.choseBest === false, countBefore, countAfter };
  const log = [...duel.log, { type: 'illucia', text: askLine(letter, count, duel.lastHit), note }];
  if (positions.length) {
    return { ...turn.session, lastGuess, phase: 'reveal',
      log: [...log, { type: 'board', pattern: getPattern(duel.round), letter, hidden: positions, revealed: [], caption: `Turn ${count} · ${L} · hit` }] };
  }
  return { ...turn.session, lastGuess, phase: 'reply', log };
}

// The player shows her one tile. When every tile is shown, she continues.
function reveal(duel, index) {
  const board = duel.log.at(-1);
  if (duel.phase !== 'reveal' || board.type !== 'board' || !board.hidden.includes(index) || board.revealed.includes(index)) return duel;
  const updated = { ...board, revealed: [...board.revealed, index] };
  const log = [...duel.log.slice(0, -1), updated];
  if (updated.revealed.length < updated.hidden.length) return { ...duel, log };
  if (getRoundStatus(duel.round) === 'solved') {
    return { ...duel, phase: 'over', log: [...log, { type: 'illucia', text: solvedLine(duel.round.answer, duel.round.guesses.length) },
      ...remembered(duel, false)] };
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
      caption: `Turn ${turn} · ${letter.toUpperCase()} · miss` }, ...(over ? remembered(duel, true) : [])];
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

function Composer({ onStart, ladder, spent, experimental, setExperimental }) {
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
      const note = startWarning(word, entries, tier, ladder, spent, experimental);
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
      <label className="duel-experimental">
        <input type="checkbox" checked={experimental} onChange={event => setExperimental(event.target.checked)} aria-describedby="duel-experimental-note" />
        Experimental AI mode
      </label>
      {experimental && <p id="duel-experimental-note" className="duel-warning">{EXPERIMENTAL_WARNING}</p>}
      {warned && <p className="duel-warning" role="status">{warning.text}</p>}
      <button type="submit" className="hm-button primary">{warned ? 'Start anyway' : 'Start the duel'}</button>
    </fieldset>
    {loading && <p role="status">Loading her {secret.trim().length}-letter words…</p>}
  </form>;
}

// Her question is a bet: answering helps her, declining tells her nothing. When WordNet does
// not know the player's word, the answer cannot be checked, and the card says so first.
function Offer({ duel, onAnswer }) {
  const stake = offerStake(duel);
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
  if (duel.experimental) return <p className="duel-muted">Experimental duels earn no points.</p>;
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

function Result({ duel, claim, spent, restart, rematch, retry, showStats }) {
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
        <button type="button" className="hm-button" onClick={showStats}>Your record</button>
      </div>
    </div>
  </section>;
}

function DuelPage({ userId, username }) {
  const [duel, setDuel] = useState(null);
  const rounds = useIlluciaRounds(userId, duel);
  const { ladder, spent } = rounds;
  const [statsOpen, setStatsOpen] = useState(false);
  // Off on every page load; kept for the next duel on this page only.
  const [experimental, setExperimental] = useState(false);
  const bottom = useRef(null);
  const greeting = useMemo(() => greetingLine(username?.length ?? 0), [username]);

  // Her turn runs once per thinking pause. The guess is computed here, not in
  // a state updater, so StrictMode's double-invoked updaters never run the solver twice.
  useEffect(() => {
    if (duel?.phase !== 'thinking') return;
    const timer = setTimeout(() => setDuel(guess(duel)), THINK_MS);
    return () => clearTimeout(timer);
  }, [duel]);

  // Experimental mode: ask her AI helper; a stale reply (new word, page left) is dropped.
  useEffect(() => {
    if (duel?.phase !== 'consulting') return;
    const controller = new AbortController();
    askIlluciaAi({ roundId: duel.ticket.roundId, candidates: duel.consult, signal: controller.signal })
      .then(reply => setDuel(current => (current === duel ? consulted(current, reply) : current)))
      .catch(() => {});
    return () => controller.abort();
  }, [duel]);

  // Keep the newest exchange in view as the conversation grows downwards.
  useEffect(() => {
    if (!duel) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    bottom.current?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'end' });
  }, [duel?.log.length, duel?.phase]);

  async function begin(word, assets, tier, mode = experimental) {
    const started = await rounds.start(word, tier, mode);
    if (started) setDuel(newDuel(word, assets, tier, started.ticket));
  }

  // The round is over: the duel no longer changes, so this runs once per round.
  useEffect(() => { if (duel?.phase === 'over') rounds.finish(duel); }, [duel]);

  const restart = () => {
    setStatsOpen(false);
    // Leaving a scored round before it is over abandons it.
    if (duel?.ticket && duel.phase !== 'over') rounds.abandon();
    setDuel(null);
  };
  const lastIndex = duel ? duel.log.length - 1 : -1;
  const claimFor = rounds.claimFor(duel);

  return <div className="duel-page">
    <header className="duel-heading">
      <h1 className="hm-title">Illucia</h1>
      <p className="hm-subtitle">Play vs AI · a duel, letter by letter</p>
    </header>

    {duel && <StatusBar key={duel.ticket?.roundId ?? duel.seed} duel={duel} restart={restart} />}

    <div className="duel-log" role="log" aria-live="polite" aria-relevant="additions">
      <Message from="illucia">Hello, {username}. {greeting} I guess your secret word one letter at a time.</Message>
      {!duel && !statsOpen && <button type="button" className="duel-new duel-record" onClick={() => setStatsOpen(true)}>Your record vs Illucia</button>}
      {statsOpen && <IlluciaRecord prefix="duel" onClose={() => setStatsOpen(false)} />}
      {!duel && <div className="duel-msg from-player"><Composer onStart={(word, assets, tier) => begin(word, assets, tier)} ladder={ladder} spent={spent}
        experimental={experimental} setExperimental={setExperimental} /></div>}
      {duel?.log.map((entry, index) => entry.type === 'board'
        ? <Board key={index} entry={entry} answer={duel.round.answer} active={index === lastIndex && duel.phase === 'reveal'}
          onReveal={position => setDuel(current => reveal(current, position))} />
        : entry.type === 'stakes' ? <p key={index} className="duel-stakes">{entry.text}</p>
          : <Message key={index} from={entry.type} note={entry.note}>{entry.text}</Message>)}
      {(duel?.phase === 'thinking' || duel?.phase === 'consulting') && <div className="duel-msg from-illucia" aria-hidden="true">
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

    {duel?.phase === 'over' && <Result duel={duel} claim={claimFor} spent={spent} restart={restart} retry={() => rounds.retry(duel)}
      showStats={() => { setDuel(null); setStatsOpen(true); }}
      rematch={tier => begin(duel.round.answer, duel.assets, tier, duel.experimental)} />}

    <div ref={bottom} className="duel-bottom" />
    <p className="duel-credits">Vocabulary: ESDB/SCOWL · filtered with LDNOOBW · questions: Open English WordNet (CC BY 4.0). <a href="/illucia/credits.html" target="_blank" rel="noreferrer">Credits &amp; licences</a></p>
  </div>;
}
