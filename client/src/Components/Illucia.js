import React, { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { applyGuess, createRound, getPattern, getRemainingMisses, getRoundStatus, MAX_MISSES } from '../lib/hangman-core.js';
import { ALPHABET, VOCABULARY_TIERS, createKnowledge, isAcceptedWord, parseLexicon } from '../lib/illucia/lexicon.js';
import { toPublicState } from '../lib/illucia/public-state.js';
import { filterCandidates } from '../lib/illucia/candidates.js';
import { analyzeDecision, chooseLetter } from '../lib/illucia/strategy.js';
import { openingLine, rejectionLine, turnLine } from '../lib/illucia/lines.js';
import './Illucia.css';

export default function Illucia() {
  const { user, status, refresh } = useAuth();
  if (status === 'loading') return <p role="status">Checking your session…</p>;
  if (status === 'error') return <div className="illucia-page"><p>Cannot check your session right now.</p><button onClick={refresh}>Try again</button></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: '/illucia' }} />;
  return <IlluciaPage key={user.id} />;
}

function Portrait() {
  return <svg className="illucia-portrait" viewBox="0 0 160 160" role="img" aria-label="Illucia, a geometric robot with violet eyes">
    <circle cx="80" cy="80" r="74" fill="#101d27" stroke="#76ceca" />
    <path d="M36 115V58L56 32H104L124 58V115L102 135H58Z" fill="#29394c" stroke="#b99cde" strokeWidth="2" />
    <path d="M43 69L75 75L66 88L45 83M117 69L85 75L94 88L115 83" fill="#c9a6ff" />
    <path d="M65 111H95M80 44V60M31 77H19M129 77H141" stroke="#76ceca" strokeWidth="3" />
  </svg>;
}

function IlluciaSetup({ onStart }) {
  const [secret, setSecret] = useState('');
  const [tierId, setTierId] = useState('master');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pending = useRef(null);
  useEffect(() => () => {
    pending.current?.abort();
    pending.current = null;
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    const word = secret.toLowerCase();
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
      const tier = VOCABULARY_TIERS.find(value => value.id === tierId);
      setSecret('');
      onStart(createRound(word), createKnowledge(entries, tier.maxSize), tier);
    } catch {
      if (pending.current === controller) setError('The vocabulary could not load. Please try again.');
    } finally {
      clearTimeout(timeout);
      if (pending.current === controller) { pending.current = null; setLoading(false); }
    }
  }

  return <section className="illucia-panel illucia-setup">
    <Portrait />
    <h2>Can your word outwit Illucia?</h2>
    <p>You choose the word. She guesses the letters.<br />Six misses and you win. Hits cost her nothing.</p>
    <form onSubmit={submit}>
      <fieldset disabled={loading}>
        <legend>Choose her vocabulary</legend>
        <div className="illucia-tiers">{VOCABULARY_TIERS.map(tier => <label key={tier.id}>
          <input type="radio" name="illucia-tier" value={tier.id} checked={tierId === tier.id} onChange={() => setTierId(tier.id)} />
          <span>{tier.label}</span>
        </label>)}</div>
        <p className="illucia-muted">Apprentice knows common words; Scholar knows more; Master knows every accepted word. All three use the same strategy.</p>
        <label className="illucia-secret-label" htmlFor="illucia-secret">Your secret word</label>
        {/* Not type="password": browsers would offer to save and sync the word as a credential. */}
        <input id="illucia-secret" type="text" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} value={secret} onChange={event => setSecret(event.target.value)} aria-describedby="illucia-trust illucia-validation" aria-invalid={Boolean(error)} />
        <p id="illucia-trust" className="illucia-muted">Your secret word never leaves your browser.</p>
        <p id="illucia-validation" role="alert">{error}</p>
        <button type="submit">Challenge Illucia</button>
      </fieldset>
      {loading && <p role="status">Loading this word length…</p>}
    </form>
  </section>;
}

function IlluciaGame({ game, restart, error }) {
  const { round, knowledge, tier, turns, line } = game;
  const status = getRoundStatus(round);
  const playing = status === 'playing';
  const candidates = filterCandidates(toPublicState(round), knowledge.words);
  const remaining = getRemainingMisses(round);
  const latest = turns.at(-1);
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, [playing]);

  return <>
    <div className="illucia-game-grid">
      <section className="illucia-panel illucia-stage">
        <Portrait />
        <h2 ref={heading} tabIndex={-1}>{playing ? `${tier.label} Illucia` : status === 'solved' ? 'Illucia wins' : 'You win!'}</h2>
        <p className="illucia-mind"><strong>{candidates.length.toLocaleString()}</strong> {candidates.length === 1 ? 'candidate' : 'candidates'} in mind</p>
        <p className="illucia-commentary">“{line}”</p>
        <p className="illucia-muted">{playing && !error ? 'Thinking…' : 'Round ended.'}</p>
      </section>
      <section className="illucia-panel illucia-board">
        <h2>The challenge</h2>
        <div className="illucia-pattern" role="img" style={{ '--word-length': round.answer.length }} aria-label={`Word: ${getPattern(round).map(letter => letter || 'blank').join(' ')}`}>
          {getPattern(round).map((letter, index) => <span key={index} aria-hidden="true">{letter || '\u00a0'}</span>)}
        </div>
        <p>{remaining} of {MAX_MISSES} misses left</p>
        <div className="illucia-misses" aria-hidden="true">{Array.from({ length: MAX_MISSES }, (_, index) => <span key={index} className={index < remaining ? 'available' : ''} />)}</div>
        <div className="illucia-letters" role="group" aria-label="Letter history">{[...ALPHABET].map(letter => {
          const used = round.guesses.includes(letter);
          const state = used ? (getPattern(round).includes(letter) ? 'hit' : 'miss') : 'unused';
          return <span key={letter} role="img" className={`${state} ${latest?.letter === letter ? 'latest' : ''}`} aria-label={`${letter.toUpperCase()}: ${state}`}>{letter}<small>{state === 'hit' ? '✓' : state === 'miss' ? '×' : '·'}</small></span>;
        })}</div>
        <p role="status" aria-live="polite" aria-atomic="true" className="illucia-announcement">{latest ? `Turn ${turns.length} · ${latest.letter.toUpperCase()} · ${latest.positions ? `HIT · ${latest.positions} ${latest.positions === 1 ? 'position' : 'positions'}` : 'MISS'} · ${remaining} misses left.${!playing ? status === 'solved' ? ' Illucia wins.' : ' You win.' : ''}` : 'The challenge has begun.'}</p>
        <details className="illucia-analysis">
          <summary>How Illucia thinks</summary>
          <p>She chooses the unused letter found in the most remaining words. Each revealed letter must match every position.</p>
          {latest && <p>{latest.fallback ? `${latest.letter.toUpperCase()} came from letter frequencies in her own vocabulary. No candidates remained; she did not switch tiers.` : `Before that guess, ${latest.letter.toUpperCase()} appeared in ${Math.round(latest.hitCount / latest.candidateCount * 100)}% of her ${latest.candidateCount.toLocaleString()} candidates.`}</p>}
          <p>Her solver sees the pattern and guesses, never your secret word.</p>
        </details>
      </section>
    </div>
    {error && <p role="alert" className="illucia-panel">{error}</p>}
    {!playing && <section className="illucia-panel illucia-result">
      <h2>The word was <strong>{round.answer.toUpperCase()}</strong></h2>
      <p>{status === 'solved' ? 'She revealed every letter.' : 'You held out for six misses.'} No Hall of Fame points are awarded in this mode.</p>
      <p>Final suspects: {candidates.length ? candidates.slice(0, 5).join(', ') : 'none left in her vocabulary'}{candidates.length > 5 ? ` (showing 5 of ${candidates.length})` : ''}.</p>
    </section>}
    <button className="illucia-restart" onClick={restart}>{playing ? 'Choose another word' : 'Play again'}</button>
    {turns.length > 0 && <details className="illucia-panel illucia-log"><summary>Turn log ({turns.length})</summary><ol>{turns.map((turn, index) => <li key={turn.letter}>Turn {index + 1} · {turn.letter.toUpperCase()} · {turn.positions ? `HIT · ${turn.positions} positions` : 'MISS'}</li>)}</ol></details>}
  </>;
}

function IlluciaPage() {
  const [game, setGame] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!game || error || getRoundStatus(game.round) !== 'playing') return;
    const timer = setTimeout(() => {
      try {
        const state = toPublicState(game.round);
        const letter = chooseLetter(state, game.knowledge);
        const decision = analyzeDecision(state, game.knowledge);
        const round = applyGuess(game.round, letter);
        if (round === game.round) throw new Error('No valid move');
        const positions = getPattern(round).filter(value => value === letter).length;
        const turns = [...game.turns, { ...decision, letter, positions }];
        setGame({ ...game, round, turns, line: turnLine(round, positions, game.turns) });
      } catch {
        setError('Illucia could not continue this round. Please choose another word.');
      }
    }, 1100);
    return () => clearTimeout(timer);
  }, [game, error]);

  return <main className="illucia-page">
    <header className="illucia-heading"><p>PLAY VS AI</p><h1>Illucia</h1><p>A battle of words and wits</p></header>
    {game ? <IlluciaGame game={game} error={error} restart={() => { setGame(null); setError(''); }} /> : <IlluciaSetup onStart={(round, knowledge, tier) => setGame({ round, knowledge, tier, turns: [], line: openingLine(round.answer.length) })} />}
    <p className="illucia-credits">Vocabulary: ESDB/SCOWL · filtered with LDNOOBW. <a href="/illucia/credits.html" target="_blank" rel="noreferrer">Credits &amp; licences</a></p>
  </main>;
}
