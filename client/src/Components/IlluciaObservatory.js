import React, { useEffect, useMemo, useRef, useState } from 'react';
import RegisteredOnly from './RegisteredOnly';
import { useAuth } from './AuthProvider';
import IlluciaFigure from './IlluciaFigure';
import { applyGuess, createRound, getPattern, getRemainingMisses, getRoundStatus, MAX_MISSES } from '../lib/hangman-core.js';
import { ALPHABET, VOCABULARY_TIERS, createKnowledge, isAcceptedWord, parseLexicon } from '../lib/illucia/lexicon.js';
import { toPublicState } from '../lib/illucia/public-state.js';
import { filterCandidates } from '../lib/illucia/candidates.js';
import { analyzeDecision } from '../lib/illucia/strategy.js';
import { rejectionLine } from '../lib/illucia/lines.js';
import { greetingLine, openingLine, turnLine } from '../lib/illucia/observatory-lines.js';
import { isEnglish } from '../lib/illucia/voices.js';
import { useSpeech } from '../lib/illucia/use-speech.js';
import './IlluciaObservatory.css';

const STAR_LIMIT = 220;
const TIER_NOTES = {
  apprentice: 'Common words only. She is still learning.',
  scholar: 'Everyday and less common words.',
  master: 'Every word she accepts. Good luck.',
};

export default function IlluciaObservatory() {
  const { user, status, refresh } = useAuth();
  if (status === 'loading') return <p role="status">Checking your session…</p>;
  if (status === 'error') return <div className="obs-page"><p>Cannot check your session right now.</p><button onClick={refresh}>Try again</button></div>;
  if (!user) return <RegisteredOnly from="/illucia-observatory" />;
  return <ObservatoryPage key={user.id} username={user.username} />;
}

// Stable pseudo-random numbers per word, so a word keeps its star.
function hash(word) {
  let value = 2166136261;
  for (let i = 0; i < word.length; i++) {
    value ^= word.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  // Final avalanche, so similar words land far apart in the sky.
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return value >>> 0;
}

function brightestStars(words) {
  return words.map(word => [hash(word), word]).sort((a, b) => a[0] - b[0])
    .slice(0, STAR_LIMIT).map(([, word]) => word);
}

function starStyle(word) {
  const h = hash(word);
  const mix = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  return {
    left: `${(h & 0xffff) / 655.35}%`,
    top: `${(h >>> 16) / 655.35}%`,
    '--size': `${1.5 + (mix % 3)}px`,
    '--delay': `${-(mix >>> 8) % 4000}ms`,
    tone: mix % 7 === 0 ? 'gold' : mix % 7 === 1 ? 'violet' : '',
  };
}

// Every star behind Illucia is a word she still considers possible.
function Starfield({ lit = [], fading = [], ambient = false }) {
  const litSet = new Set(lit);
  const words = [...new Set([...lit, ...fading])].sort((a, b) => hash(a) - hash(b));
  const few = lit.length <= 12;
  return <div className={`obs-stars ${ambient ? 'ambient' : ''}`} aria-hidden="true">
    {words.map(word => {
      const { tone, ...style } = starStyle(word);
      return <span key={word} style={style} className={`${tone} ${litSet.has(word) ? (few ? 'few' : '') : 'out'}`} />;
    })}
  </div>;
}

const AMBIENT = Array.from({ length: 90 }, (_, index) => `ambient${index}`);

function SpeechBubble({ text }) {
  return <p className="obs-bubble" key={text}>{text}</p>;
}

function Pod({ children, lit, fading, ambient, count, tier, mood, thinking, turn, line, banner }) {
  return <section className="obs-pod" aria-label="Illucia">
    <Starfield lit={lit} fading={fading} ambient={ambient} />
    <div className="obs-hud">
      <span><small>Words in mind</small><b>{count === null ? '—' : count.toLocaleString('en-US')}</b></span>
      {tier && <span className="obs-tier">{tier}</span>}
    </div>
    {line && <SpeechBubble text={line} />}
    {banner && <p className={`obs-banner ${banner.tone}`}>{banner.text}</p>}
    <div className="obs-figure"><IlluciaFigure mood={mood} thinking={thinking} turn={turn} /></div>
    {children}
  </section>;
}

function Setup({ line, onStart }) {
  const [secret, setSecret] = useState('');
  const [tierId, setTierId] = useState('scholar');
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

  return <div className="obs-grid">
    <Pod ambient lit={AMBIENT} count={null} mood="idle" line={line} />
    <section className="obs-screen">
      <div className="obs-screen-inner">
        <h2>Challenge Illucia</h2>
        <p className="obs-rules">You choose a secret word. She guesses letters.<br />Hits cost her nothing. <strong>Six misses and you win.</strong></p>
        <form onSubmit={submit}>
          <fieldset disabled={loading}>
            <label className="obs-insert" htmlFor="obs-secret">Insert your secret word</label>
            {/* Not type="password": browsers would offer to save and sync the word as a credential. */}
            <input id="obs-secret" type="text" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} maxLength={15}
              value={secret} onChange={event => setSecret(event.target.value)} aria-describedby="obs-trust obs-validation" aria-invalid={Boolean(error)} />
            <p id="obs-trust" className="obs-muted">{secret.trim() ? `${secret.trim().length} letters · ` : ''}Your word stays in this browser. Illucia only sees the blanks.</p>
            <p id="obs-validation" role="alert">{error}</p>
            <div className="obs-tiers" role="radiogroup" aria-label="Her vocabulary">
              {VOCABULARY_TIERS.map(tier => <label key={tier.id} className={tierId === tier.id ? 'selected' : ''}>
                <input type="radio" name="obs-tier" value={tier.id} checked={tierId === tier.id} onChange={() => setTierId(tier.id)} />
                <b>{tier.label}</b>
                <small>{TIER_NOTES[tier.id]}</small>
              </label>)}
            </div>
            <p className="obs-muted">Same strategy at every level. Only her vocabulary changes.</p>
            <button type="submit" className="obs-start">Start the duel</button>
          </fieldset>
          {loading && <p role="status">Loading her {secret.trim().length}-letter words…</p>}
        </form>
      </div>
    </section>
  </div>;
}

function newGame(word, entries, tier) {
  const knowledge = createKnowledge(entries, tier.maxSize);
  const round = createRound(word);
  const candidates = filterCandidates(toPublicState(round), knowledge.words);
  return {
    round, entries, knowledge, tier, turns: [],
    lit: brightestStars(candidates), fading: [],
    line: openingLine(word.length, candidates.length),
  };
}

// Everything Illucia can see this turn, derived from public state only.
function readMind(game) {
  const state = toPublicState(game.round);
  const candidates = filterCandidates(state, game.knowledge.words);
  let decision = null;
  let failed = false;
  if (getRoundStatus(game.round) === 'playing') {
    try { decision = analyzeDecision(state, game.knowledge); } catch { failed = true; }
  }
  const fallback = Boolean(decision?.fallback);
  const pool = fallback ? game.knowledge.words : candidates;
  const counts = Object.fromEntries([...ALPHABET].map(letter => [letter, 0]));
  if (fallback) Object.assign(counts, game.knowledge.frequency);
  else for (const word of candidates) for (const letter of new Set(word)) counts[letter]++;
  return { state, candidates, decision, failed, fallback, counts, total: pool.length };
}

function Analyzer({ round, mind, playing }) {
  const pattern = getPattern(round);
  const next = playing ? mind.decision?.letter : null;
  const max = Math.max(1, ...[...ALPHABET].filter(letter => !round.guesses.includes(letter)).map(letter => mind.counts[letter]));
  return <div className="obs-analyzer" aria-hidden="true">
    {[...ALPHABET].map(letter => {
      const used = round.guesses.includes(letter);
      const state = used ? (pattern.includes(letter) ? 'hit' : 'miss') : letter === next ? 'next' : '';
      const height = used ? 0 : mind.counts[letter] / max;
      return <div key={letter} className={`obs-bar ${state}`}>
        <div className="obs-bar-track">
          {used ? <span className="obs-bar-cap">{state === 'hit' ? '✓' : '×'}</span>
            : <span className="obs-bar-fill" style={{ '--h': height }} />}
        </div>
        <span className="obs-bar-letter">{letter}</span>
      </div>;
    })}
  </div>;
}

function Reasoning({ round, mind, tier, playing }) {
  if (!playing) return null;
  if (mind.failed) return null;
  const letter = mind.decision.letter.toUpperCase();
  const share = Math.round(mind.counts[mind.decision.letter] / Math.max(1, mind.total) * 100);
  if (mind.fallback) {
    return <p className="obs-reasoning">None of her {tier.label} words fit this pattern. She falls back on habit: <b>{letter}</b> appears in {share}% of her {round.answer.length}-letter words, so <b>{letter}</b> is next.</p>;
  }
  return <p className="obs-reasoning"><b>{letter}</b> appears in {share}% of the {mind.total.toLocaleString('en-US')} words she still has in mind, more than any other unused letter. So <b>{letter}</b> is next.</p>;
}

function Game({ game, mind, paused, setPaused, fast, setFast, restart, rematch }) {
  const { round, tier, turns } = game;
  const status = getRoundStatus(round);
  const playing = status === 'playing' && !mind.failed;
  const remaining = getRemainingMisses(round);
  const latest = turns.at(-1);
  const pattern = getPattern(round);
  const mood = status === 'solved' ? 'triumphant' : status === 'failed' ? 'impressed' : !latest ? 'idle' : latest.positions ? 'happy' : 'worried';
  const nextTier = VOCABULARY_TIERS[VOCABULARY_TIERS.indexOf(tier) + 1];
  const heading = useRef(null);
  useEffect(() => { if (status !== 'playing') heading.current?.focus(); }, [status]);
  const shortlist = mind.candidates.length <= 10 ? mind.candidates : null;

  return <>
    <div className="obs-grid">
      <Pod lit={game.lit} fading={game.fading} count={mind.candidates.length} tier={tier.label} mood={mood}
        thinking={playing && !paused} turn={turns.length} line={game.line}
        banner={status === 'solved' ? { text: 'Illucia wins', tone: 'lose' } : status === 'failed' ? { text: 'You win!', tone: 'win' } : null} />
      <section className="obs-screen">
        <div className="obs-screen-inner">
          <h2 ref={heading} tabIndex={-1}>{status === 'solved' ? 'Illucia wins' : status === 'failed' ? 'You win!' : "Illucia's notebook"}</h2>
          {status === 'playing'
            ? <p className="obs-muted">Letter scan · turn {turns.length + 1}{paused ? ' · paused' : ''}</p>
            : <p className="obs-reveal">The word was <strong>{round.answer.toUpperCase()}</strong></p>}
          <Analyzer round={round} mind={mind} playing={playing} />
          <p className="obs-sr">{playing && mind.decision ? `Her next guess is ${mind.decision.letter.toUpperCase()}.` : ''}</p>
          <Reasoning round={round} mind={mind} tier={tier} playing={playing} />
          {mind.failed && <p role="alert" className="obs-error">Illucia could not continue this round. Please choose another word.</p>}
          {status !== 'playing' && <div className="obs-summary">
            <p>{status === 'solved' ? `She solved it in ${turns.length} guesses with ${remaining} ${remaining === 1 ? 'miss' : 'misses'} to spare.` : `You held out for six misses. She guessed ${turns.length - MAX_MISSES} letters right.`}</p>
            <p>Final suspects: {mind.candidates.length ? mind.candidates.slice(0, 5).join(', ') : `none left in her ${tier.label} vocabulary`}{mind.candidates.length > 5 ? ` (5 of ${mind.candidates.length})` : ''}.</p>
            <p className="obs-muted">Duels with Illucia do not earn Hall of Fame points.</p>
          </div>}
          {status === 'playing' && shortlist && shortlist.length > 0 && <p className="obs-shortlist">On her shortlist: {shortlist.join(' · ')}</p>}
        </div>
      </section>
    </div>

    <div className="obs-word" role="img" style={{ '--len': round.answer.length }}
      aria-label={`Word: ${pattern.map(letter => letter || 'blank').join(' ')}`}>
      {pattern.map((letter, index) => {
        const shown = letter || (status !== 'playing' ? round.answer[index] : null);
        return <span key={index} className={letter ? 'found' : shown ? 'kept' : ''} aria-hidden="true">{shown || ' '}</span>;
      })}
    </div>

    <section className="obs-console" aria-label="Duel controls">
      <div className="obs-cells" aria-label={`${remaining} of ${MAX_MISSES} misses left`} role="img">
        <small>Her chances</small>
        <div>{Array.from({ length: MAX_MISSES }, (_, index) => <span key={index} className={index < remaining ? 'on' : ''} />)}</div>
      </div>
      <ol className="obs-tape" aria-label="Her guesses">
        {turns.length === 0 && <li className="empty">Waiting for her first guess…</li>}
        {turns.map(turn => <li key={turn.letter} className={turn.positions ? 'hit' : 'miss'} aria-label={`${turn.letter.toUpperCase()}: ${turn.positions ? 'hit' : 'miss'}`}>{turn.letter}</li>)}
      </ol>
      <div className="obs-controls">
        {status === 'playing' && !mind.failed && <>
          <button type="button" onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? 'Resume' : 'Pause'}</button>
          <button type="button" onClick={() => setFast(!fast)} aria-pressed={fast}>{fast ? 'Speed 2×' : 'Speed 1×'}</button>
        </>}
        {status === 'failed' && nextTier && <button type="button" onClick={() => rematch(nextTier)}>Rematch vs {nextTier.label}</button>}
        <button type="button" className="obs-new" onClick={restart}>{status === 'playing' ? 'New word' : 'Play again'}</button>
      </div>
    </section>
    <p role="status" aria-live="polite" aria-atomic="true" className="obs-sr">{latest
      ? `Turn ${turns.length}: ${latest.letter.toUpperCase()}, ${latest.positions ? `hit, ${latest.positions} ${latest.positions === 1 ? 'position' : 'positions'}` : 'miss'}. ${remaining} misses left.${status === 'solved' ? ' Illucia wins.' : status === 'failed' ? ' You win.' : ''}`
      : 'The duel has begun.'}</p>
  </>;
}

// Voice on/off, and once on, every voice this browser offers.
function VoiceControls({ speech }) {
  if (!speech.supported) return null;
  const english = speech.voices.filter(isEnglish);
  const other = speech.voices.filter(voice => !isEnglish(voice));
  const option = voice => <option key={voice.voiceURI} value={voice.voiceURI}>
    {voice.name} · {voice.lang}{voice.localService === false ? ' · online' : ''}
  </option>;
  return <div className="obs-voice">
    <button type="button" aria-pressed={speech.enabled} onClick={() => speech.setEnabled(!speech.enabled)}>
      {speech.enabled ? 'Voice on' : 'Voice off'}
    </button>
    {speech.enabled && speech.voices.length > 0 && <label>
      <span>Her voice</span>
      <select value={speech.voice?.voiceURI ?? ''} onChange={event => speech.setVoiceURI(event.target.value)}>
        {english.length > 0 && <optgroup label="English">{english.map(option)}</optgroup>}
        {other.length > 0 && <optgroup label="Other languages">{other.map(option)}</optgroup>}
      </select>
    </label>}
  </div>;
}

function ObservatoryPage({ username }) {
  const [game, setGame] = useState(null);
  const [paused, setPaused] = useState(false);
  const [fast, setFast] = useState(false);
  const mind = useMemo(() => game && readMind(game), [game]);
  const speech = useSpeech();
  const { enabled: voiceOn, speak, stop } = speech;
  const greeting = useMemo(() => `Hello, ${username}. ${greetingLine(username?.length ?? 0)}`, [username]);
  const line = game ? game.line : greeting;
  const round = game?.round;
  const voiceURI = speech.voice?.voiceURI;

  // Speak each new line: every turn, a new round, turning the voice on or picking another voice.
  useEffect(() => {
    if (voiceOn) speak(line, fast ? 1.4 : 1);
  }, [voiceOn, line, round, voiceURI, speak]);
  useEffect(() => { if (paused) stop(); }, [paused, stop]);

  useEffect(() => {
    // She finishes her sentence before she guesses again.
    if (!game || !mind?.decision || paused || speech.busy) return;
    const delay = game.turns.length === 0 ? 2200 : fast ? 700 : 1700;
    const timer = setTimeout(() => {
      const { letter } = mind.decision;
      const round = applyGuess(game.round, letter);
      if (round === game.round) return;
      const positions = getPattern(round).filter(value => value === letter).length;
      const candidates = filterCandidates(toPublicState(round), game.knowledge.words);
      const lit = brightestStars(candidates);
      const litSet = new Set(lit);
      setGame({
        ...game, round, lit,
        fading: game.lit.filter(word => !litSet.has(word)),
        turns: [...game.turns, { letter, positions }],
        line: turnLine(round, positions, candidates.length, game.turns, game.tier.label),
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [game, mind, paused, fast, speech.busy]);

  const restart = () => { setGame(null); setPaused(false); };
  return <main className="obs-page">
    <header className="obs-heading">
      <h1>Illucia</h1>
      <p>Daughter of Professor Han Fastolfe · Aurora</p>
      <VoiceControls speech={speech} />
    </header>
    {game
      ? <Game game={game} mind={mind} paused={paused} setPaused={setPaused} fast={fast} setFast={setFast} restart={restart}
        rematch={tier => { setPaused(false); setGame(newGame(game.round.answer, game.entries, tier)); }} />
      : <Setup line={greeting} onStart={(word, entries, tier) => setGame(newGame(word, entries, tier))} />}
    <p className="obs-credits">Vocabulary: ESDB/SCOWL · filtered with LDNOOBW. <a href="/illucia/credits.html" target="_blank" rel="noreferrer">Credits &amp; licences</a></p>
  </main>;
}
