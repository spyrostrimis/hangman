import React, { useEffect, useMemo, useRef, useState } from 'react';
import RegisteredOnly from './RegisteredOnly';
import { useAuth } from './AuthProvider';
import { applyGuess, createRound, getPattern, getRemainingMisses, getRoundStatus, MAX_MISSES } from '../lib/hangman-core.js';
import { VOCABULARY_TIERS, createKnowledge, isAcceptedWord, parseLexicon } from '../lib/illucia/lexicon.js';
import { toPublicState } from '../lib/illucia/public-state.js';
import { filterCandidates } from '../lib/illucia/candidates.js';
import { analyzeDecision } from '../lib/illucia/strategy.js';
import { rejectionLine } from '../lib/illucia/lines.js';
import { greetingLine, openingLine } from '../lib/illucia/observatory-lines.js';
import { REPLIES, askLine, reasonLine, replyLine, solvedLine } from '../lib/illucia/duel-lines.js';
import './Illucia.css';

// Play vs AI as a conversation that scrolls down: Illucia asks for a letter,
// the player shows her where it goes (or answers a miss), and she carries on.
// Game code decides every hit and miss; the player's replies are only words.

const THINK_MS = 1100;
const TIER_NOTES = {
  apprentice: 'Common words only.',
  scholar: 'Everyday and less common words.',
  master: 'Every word she accepts.',
};

export default function Illucia() {
  const { user, status, refresh } = useAuth();
  if (status === 'loading') return <p role="status">Checking your session…</p>;
  if (status === 'error') return <div className="duel-page"><p>Cannot check your session right now.</p><button onClick={refresh}>Try again</button></div>;
  if (!user) return <RegisteredOnly from="/illucia" />;
  return <DuelPage key={user.id} username={user.username} />;
}

const countWords = (round, knowledge) => filterCandidates(toPublicState(round), knowledge.words).length;

function newDuel(word, entries, tier) {
  const knowledge = createKnowledge(entries, tier.maxSize);
  const round = createRound(word);
  return {
    round, entries, knowledge, tier, phase: 'thinking', lastGuess: null, lastHit: null,
    log: [
      { type: 'player', text: `My word is ready: ${word.length} letters. You get the ${tier.label} vocabulary.` },
      { type: 'illucia', text: openingLine(word.length, countWords(round, knowledge)) },
      { type: 'board', pattern: getPattern(round), hidden: [], revealed: [], caption: 'Start' },
    ],
  };
}

function failed(duel) {
  return { ...duel, phase: 'error', log: [...duel.log, { type: 'illucia', text: 'Something went wrong in my notes. Let us start again with a new word.' }] };
}

// Her turn: pick a letter from public state only, then wait for the player.
function guess(duel) {
  const state = toPublicState(duel.round);
  let decision;
  try { decision = analyzeDecision(state, duel.knowledge); } catch { return failed(duel); }
  const { letter } = decision;
  const round = applyGuess(duel.round, letter);
  if (!letter || round === duel.round) return failed(duel);
  const before = getPattern(duel.round);
  const after = getPattern(round);
  const positions = after.flatMap((value, index) => (value === letter && before[index] === null ? [index] : []));
  const L = letter.toUpperCase();
  const share = decision.fallback
    ? Math.round(duel.knowledge.frequency[letter] / Math.max(1, duel.knowledge.words.length) * 100)
    : Math.round(decision.hitCount / decision.candidateCount * 100);
  const note = reasonLine({ letter, share, candidates: decision.candidateCount, fallback: decision.fallback,
    tierLabel: duel.tier.label, length: state.length });
  const turn = round.guesses.length;
  const lastGuess = { letter, positions, share, countBefore: decision.candidateCount, countAfter: countWords(round, duel.knowledge) };
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
  const { countBefore, countAfter } = duel.lastGuess;
  return { ...duel, log, phase: 'thinking',
    lastHit: { positions: updated.hidden.length, single: countAfter === 1 && countBefore > 1 } };
}

// The player answers a miss; she answers back, and the unchanged row follows.
function reply(duel, replyId) {
  const choice = REPLIES.find(value => value.id === replyId);
  if (duel.phase !== 'reply' || !choice) return duel;
  const { letter, share, countAfter } = duel.lastGuess;
  const missesLeft = getRemainingMisses(duel.round);
  const turn = duel.round.guesses.length;
  const answer = replyLine(replyId, { letter, turn, count: countAfter, share, length: duel.round.answer.length, missesLeft });
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

function Composer({ onStart }) {
  const [secret, setSecret] = useState('');
  const [tierId, setTierId] = useState('scholar');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pending = useRef(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);

  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    const word = secret.trim().toLowerCase();
    if (!/^[a-z]{3,15}$/.test(word)) {
      setError('Choose 3–15 letters, A–Z only, with no spaces or punctuation.');
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError('');
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      // Only the length is sent. Never put the secret in a URL or request body.
      const response = await fetch(`/illucia/words/${word.length}.txt`, { signal: controller.signal });
      if (!response.ok) throw new Error('Vocabulary unavailable');
      const entries = parseLexicon(await response.text(), word.length);
      if (controller.signal.aborted) return;
      if (!isAcceptedWord(word, entries)) {
        setError(rejectionLine(word.length));
        return;
      }
      setSecret('');
      onStart(word, entries, VOCABULARY_TIERS.find(value => value.id === tierId));
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
      <p id="duel-trust" className="duel-muted">{secret.trim() ? `${secret.trim().length} letters · ` : ''}Illucia only ever sees the blanks.</p>
      <p id="duel-validation" role="alert">{error}</p>
      <div className="duel-tiers" role="radiogroup" aria-label="Her vocabulary">
        {VOCABULARY_TIERS.map(tier => <label key={tier.id} className={tierId === tier.id ? 'selected' : ''}>
          <input type="radio" name="duel-tier" value={tier.id} checked={tierId === tier.id} onChange={() => setTierId(tier.id)} />
          <b>{tier.label}</b>
          <small>{TIER_NOTES[tier.id]}</small>
        </label>)}
      </div>
      <button type="submit" className="hm-button primary">Start the duel</button>
    </fieldset>
    {loading && <p role="status">Loading her {secret.trim().length}-letter words…</p>}
  </form>;
}

function StatusBar({ duel, restart }) {
  const remaining = getRemainingMisses(duel.round);
  const current = useMemo(() => countWords(duel.round, duel.knowledge), [duel.round, duel.knowledge]);
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
    </div>
    <button type="button" className="duel-new" onClick={restart}>New word</button>
  </div>;
}

function Result({ duel, restart, rematch }) {
  const status = getRoundStatus(duel.round);
  const misses = MAX_MISSES - getRemainingMisses(duel.round);
  const guesses = duel.round.guesses.length;
  const nextTier = VOCABULARY_TIERS[VOCABULARY_TIERS.indexOf(duel.tier) + 1];
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <section className="hm-screen duel-result" aria-labelledby="duel-result-title">
    <div className="hm-screen-inner">
      <h2 id="duel-result-title" ref={heading} tabIndex={-1}>{status === 'solved' ? 'Illucia wins' : 'You win'}</h2>
      <p>The word was <strong>{duel.round.answer.toUpperCase()}</strong>.</p>
      <p>{guesses} guesses: {guesses - misses} {guesses - misses === 1 ? 'hit' : 'hits'}, {misses} {misses === 1 ? 'miss' : 'misses'}.</p>
      <p className="duel-muted">Duels with Illucia do not earn Hall of Fame points.</p>
      <div className="duel-result-actions">
        <button type="button" className="hm-button primary" onClick={restart}>Play again</button>
        {status === 'failed' && nextTier && <button type="button" className="hm-button" onClick={() => rematch(nextTier)}>Rematch vs {nextTier.label}</button>}
      </div>
    </div>
  </section>;
}

function DuelPage({ username }) {
  const [duel, setDuel] = useState(null);
  const bottom = useRef(null);
  const greeting = useMemo(() => greetingLine(username?.length ?? 0), [username]);

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

  const restart = () => setDuel(null);
  const lastIndex = duel ? duel.log.length - 1 : -1;

  return <div className="duel-page">
    <header className="duel-heading">
      <h1 className="hm-title">Illucia</h1>
      <p className="hm-subtitle">Play vs AI · a duel, letter by letter</p>
    </header>

    {duel && <StatusBar duel={duel} restart={restart} />}

    <div className="duel-log" role="log" aria-live="polite" aria-relevant="additions">
      <Message from="illucia">Hello, {username}. {greeting} I guess your secret word one letter at a time.</Message>
      {!duel && <div className="duel-msg from-player"><Composer onStart={(word, entries, tier) => setDuel(newDuel(word, entries, tier))} /></div>}
      {duel?.log.map((entry, index) => entry.type === 'board'
        ? <Board key={index} entry={entry} answer={duel.round.answer} active={index === lastIndex && duel.phase === 'reveal'}
          onReveal={position => setDuel(current => reveal(current, position))} />
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
      {duel?.phase === 'error' && <div className="duel-result-actions"><button type="button" className="hm-button primary" onClick={restart}>New word</button></div>}
    </div>

    {duel?.phase === 'over' && <Result duel={duel} restart={restart}
      rematch={tier => setDuel(newDuel(duel.round.answer, duel.entries, tier))} />}

    <div ref={bottom} className="duel-bottom" />
    <p className="duel-credits">Vocabulary: ESDB/SCOWL · filtered with LDNOOBW. <a href="/illucia/credits.html" target="_blank" rel="noreferrer">Credits &amp; licences</a></p>
  </div>;
}
