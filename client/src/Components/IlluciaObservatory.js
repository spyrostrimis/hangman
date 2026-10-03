import React, { useEffect, useMemo, useRef, useState } from 'react';
import RegisteredOnly from './RegisteredOnly';
import { useAuth } from './AuthProvider';
import IlluciaFigure from './IlluciaFigure';
import IlluciaRecord from './IlluciaRecord';
import { getPattern, getRemainingMisses, getRoundStatus, MAX_MISSES } from '../lib/hangman-core.js';
import { ALPHABET, MAX_WORD_LENGTH, MIN_WORD_LENGTH, VOCABULARY_TIERS, isAcceptedWord, isWordShape, parseLexicon } from '../lib/illucia/lexicon.js';
import { toPublicState } from '../lib/illucia/public-state.js';
import { filterCandidates } from '../lib/illucia/candidates.js';
import { rejectionLine } from '../lib/illucia/lines.js';
import { greetingLine, notebookLine, openingLine, questionSmallPrint, turnLine } from '../lib/illucia/observatory-lines.js';
import { AI_NOTE, ANSWERS, aiAnswerLine, aiFallbackLine, aiQuestionLine, answerLine, questionLine } from '../lib/illucia/duel-lines.js';
import { EXPERIMENTAL_WARNING, answerQuestion, applyConsult, createSession, herKnowledge, offerStake, previewPoints, rememberLine, roundStakes, startWarning, takeTurn, tierLabel } from '../lib/illucia/duel-session.js';
import { loadQuestions } from '../lib/illucia-assets.js';
import { askIlluciaAi } from '../lib/illucia-rounds.js';
import { useIlluciaRounds } from '../lib/use-illucia-rounds.js';
import { ILLUCIA_ALREADY_WON_MESSAGE, ILLUCIA_NO_POINTS } from '../../../shared/scoring-protocol.js';
import './IlluciaObservatory.css';

// The Observatory: the same duel as /illucia (the shared session in lib/illucia/duel-session.js
// and the server rounds in lib/use-illucia-rounds.js), watched on one screen.

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
  return <ObservatoryPage key={user.id} userId={user.id} username={user.username} />;
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

// The stars on show: words that beat her before first (her memory of this player), then a stable
// sample of the rest.
function brightestStars(words, learned) {
  const remembered = words.filter(word => learned?.has(word));
  const rest = words.filter(word => !learned?.has(word)).map(word => [hash(word), word]).sort((a, b) => a[0] - b[0])
    .map(([, word]) => word);
  return [...remembered, ...rest].slice(0, STAR_LIMIT);
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
function Starfield({ lit = [], fading = [], ambient = false, learned = null, sideOf = null }) {
  const litSet = new Set(lit);
  const words = [...new Set([...lit, ...fading])].sort((a, b) => hash(a) - hash(b));
  const few = lit.length <= 12;
  return <div className={`obs-stars ${ambient ? 'ambient' : ''}`} aria-hidden="true">
    {words.map(word => {
      const { tone, ...style } = starStyle(word);
      const side = sideOf?.(word);
      const kind = side ? `side-${side}` : learned?.has(word) ? 'learned' : tone;
      return <span key={word} style={style} className={`${kind} ${litSet.has(word) ? (few ? 'few' : '') : 'out'}`} />;
    })}
  </div>;
}

const AMBIENT = Array.from({ length: 90 }, (_, index) => `ambient${index}`);

function SpeechBubble({ text }) {
  return <p className="obs-bubble" key={text}>{text}</p>;
}

function Pod({ children, lit, fading, ambient, learned, sideOf, count, tier, points, mood, thinking, turn, line, banner }) {
  return <section className="obs-pod" aria-label="Illucia">
    <Starfield lit={lit} fading={fading} ambient={ambient} learned={learned} sideOf={sideOf} />
    <div className="obs-hud">
      <span><small>Words in mind</small><b>{count === null ? '—' : count.toLocaleString('en-US')}</b></span>
      {tier && <span className="obs-hud-chips">
        <span className="obs-tier">{tier}</span>
        {points && <span className="obs-points" aria-label={`Points: ${points}`}>{points}</span>}
      </span>}
    </div>
    {line && <SpeechBubble text={line} />}
    {banner && <p className={`obs-banner ${banner.tone}`}>{banner.text}</p>}
    <div className="obs-figure"><IlluciaFigure mood={mood} thinking={thinking} turn={turn} /></div>
    {children}
  </section>;
}

// The ladder on the tier cards: climbed rungs, and where the next win must come from.
function rungBadge(ladder, index) {
  if (!ladder) return null;
  if (index < ladder.rung) return { text: 'Climbed', tone: 'done' };
  if (ladder.rung === 0) return index === 0 ? { text: 'Ladder starts here', tone: 'next' } : null;
  return VOCABULARY_TIERS[index].id === ladder.next ? { text: `Next rung · ${ladder.minLength}+ letters`, tone: 'next' } : null;
}

function Setup({ username, onStart, ladder, spent, recordOpen, setRecordOpen, experimental, setExperimental }) {
  const [secret, setSecret] = useState('');
  const [tierId, setTierId] = useState(ladder?.rung > 0 ? ladder.next : 'scholar');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState(null); // { key, text }: a second press starts anyway
  const [loading, setLoading] = useState(false);
  const pending = useRef(null);
  const chosen = useRef(false);
  const greeting = useMemo(() => greetingLine(username?.length ?? 0), [username]);
  useEffect(() => () => {
    pending.current?.abort();
    pending.current = null;
  }, []);
  // The ladder may arrive after the form: offer its next rung unless the player already chose.
  useEffect(() => { if (!chosen.current && ladder?.rung > 0) setTierId(ladder.next); }, [ladder]);
  const warned = warning?.key === `${secret.trim().toLowerCase()}:${tierId}`;

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
      // The word list and labels are static files: only the length is in these requests.
      const options = { signal: controller.signal };
      const [response, questions] = await Promise.all([fetch(`/illucia/words/${word.length}.txt`, options), loadQuestions(word.length, options)]);
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

  return <div className="obs-grid">
    <Pod ambient lit={AMBIENT} count={null} mood="idle" line={`Hello, ${username}. ${greeting}`} />
    <section className="obs-screen">
      <div className="obs-screen-inner">
        {recordOpen ? <IlluciaRecord prefix="obs" onClose={() => setRecordOpen(false)} /> : <>
        <h2>Challenge Illucia</h2>
        <p className="obs-rules">You choose a secret word. She guesses letters.<br />Hits cost her nothing. <strong>Six misses and you win.</strong></p>
        <form onSubmit={submit}>
          <fieldset disabled={loading}>
            <label className="obs-insert" htmlFor="obs-secret">Insert your secret word</label>
            {/* Not type="password": browsers would offer to save and sync the word as a credential. */}
            <input id="obs-secret" type="text" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} maxLength={15}
              value={secret} onChange={event => setSecret(event.target.value)} aria-describedby="obs-trust obs-validation" aria-invalid={Boolean(error)} />
            <p id="obs-trust" className="obs-muted">{secret.trim() ? `${secret.trim().length} letters · ` : ''}Her guessing sees only the blanks. The server keeps your word to check the result.</p>
            <p id="obs-validation" role="alert">{error}</p>
            <div className="obs-tiers" role="radiogroup" aria-label="Her vocabulary">
              {VOCABULARY_TIERS.map((tier, index) => {
                const badge = rungBadge(ladder, index);
                return <label key={tier.id} className={tierId === tier.id ? 'selected' : ''}>
                  <input type="radio" name="obs-tier" value={tier.id} checked={tierId === tier.id} onChange={() => { chosen.current = true; setTierId(tier.id); }} />
                  <b>{tier.label}</b>
                  <small>{TIER_NOTES[tier.id]}</small>
                  {badge && <span className={`obs-rung ${badge.tone}`}>{badge.text}</span>}
                </label>;
              })}
            </div>
            <p className="obs-muted">Each level knows more words and plays a little more carefully.</p>
            {ladder && <p className="obs-muted obs-ladder">{ladder.rung === 0
              ? 'Ladder: beat Apprentice, then Scholar, then Master in a row, each word longer, for +100.'
              : `Ladder: next, ${tierLabel(ladder.next)} with a word of ${ladder.minLength}+ letters. +100 at the top.`}</p>}
            <label className="obs-experimental">
              <input type="checkbox" checked={experimental} onChange={event => setExperimental(event.target.checked)} aria-describedby="obs-experimental-note" />
              Experimental AI mode
            </label>
            {experimental && <p id="obs-experimental-note" className="obs-warning">{EXPERIMENTAL_WARNING}</p>}
            {warned && <p className="obs-warning" role="status">{warning.text}</p>}
            <button type="submit" className="obs-start">{warned ? 'Start anyway' : 'Start the duel'}</button>
          </fieldset>
          {loading && <p role="status">Loading her {secret.trim().length}-letter words…</p>}
        </form>
        <button type="button" className="obs-record" onClick={() => setRecordOpen(true)}>Your record vs Illucia</button>
        </>}
      </div>
    </section>
  </div>;
}

// ticket: the server's round (seed, points, ladder, memory), or null when it could not start.
// assets: { entries, questions: { labels, categories } | null }. Without labels she asks nothing.
function newGame(word, assets, tier, ticket = null) {
  const session = createSession(word, assets, tier, ticket);
  const candidates = filterCandidates(toPublicState(session.round), session.knowledge.words);
  return {
    ...session, turns: [], fading: [],
    lit: brightestStars(candidates, session.knowledge.learned),
    line: openingLine(word.length, candidates.length),
    stakes: roundStakes(ticket, tier, word.length).text,
  };
}

// Everything Illucia can see this turn, derived from public state only. The bars show what she
// decides on: her score per letter from her decision record (common words count more, plus her
// early vowel lean, whose part is `lean`); in a fallback, her tier's plain letter counts (the
// fallback is unweighted); with no decision (the round is over), the weighted share of the words
// still possible. shortlist: the letters she may pick; cutoff: the score they must beat.
function readMind(game) {
  const state = toPublicState(game.round);
  const knowledge = herKnowledge(game);
  const candidates = filterCandidates(state, knowledge.words);
  // takeTurn is pure: it says what she will do, and the page plays it when her pause is over.
  const turn = getRoundStatus(game.round) === 'playing' && !game.pending && !game.consult ? takeTurn(game) : null;
  const decision = turn?.type === 'letter' ? turn.decision : null;
  const failed = turn?.type === 'error';
  const fallback = Boolean(decision?.fallback);
  const scores = Object.fromEntries([...ALPHABET].map(letter => [letter, 0]));
  const lean = {};
  let shortlist = new Set();
  let cutoff = null;
  if (decision?.letters) {
    const kept = 10000 - (decision.priorWeight ?? 0);
    for (const entry of decision.letters) {
      scores[entry.letter] = entry.score;
      if (entry.bonus > 0) lean[entry.letter] = Math.floor(entry.bonus * kept / 10000);
    }
    shortlist = new Set(decision.shortlist.map(entry => entry.letter));
    cutoff = decision.cutoff;
  } else if (fallback) {
    Object.assign(scores, game.knowledge.frequency);
  } else {
    for (const word of candidates) for (const letter of new Set(word)) scores[letter] += knowledge.weights.get(word);
  }
  const fallbackShare = fallback
    ? Math.round(game.knowledge.frequency[decision.letter] / Math.max(1, game.knowledge.words.length) * 100) : 0;
  return { state, candidates, turn, decision, failed, fallback, scores, lean, shortlist, cutoff, fallbackShare, consulting: Boolean(game.consult) };
}

function Analyzer({ round, mind, playing }) {
  const pattern = getPattern(round);
  const next = playing ? mind.decision?.letter : null;
  const max = Math.max(1, ...[...ALPHABET].filter(letter => !round.guesses.includes(letter)).map(letter => mind.scores[letter]));
  const cut = playing && mind.cutoff !== null ? Math.max(0, Math.min(1, mind.cutoff / max)) : null;
  return <div className="obs-analyzer" aria-hidden="true">
    {[...ALPHABET].map(letter => {
      const used = round.guesses.includes(letter);
      const state = used ? (pattern.includes(letter) ? 'hit' : 'miss') : letter === next ? 'next' : '';
      const height = used ? 0 : mind.scores[letter] / max;
      const lean = playing && mind.lean[letter] && mind.scores[letter] ? Math.min(1, mind.lean[letter] / mind.scores[letter]) : 0;
      const listed = playing && !used && mind.shortlist.has(letter);
      return <div key={letter} className={`obs-bar ${state} ${listed ? 'listed' : ''}`}>
        <div className="obs-bar-track" style={cut === null ? undefined : { '--cut': cut }}>
          {cut !== null && <span className="obs-bar-cut" />}
          {used ? <span className="obs-bar-cap">{state === 'hit' ? '✓' : '×'}</span>
            : <span className="obs-bar-fill" style={{ '--h': height }}>{lean > 0 && <span className="obs-bar-lean" style={{ '--l': lean }} />}</span>}
        </div>
        <span className="obs-bar-letter">{letter}</span>
      </div>;
    })}
  </div>;
}

// Which side of her open question a word is on: 'yes', 'no', or null when her archive does not
// know it (it stays on both sides). Her candidates only; never the secret.
function questionSides(game) {
  const { pending } = game;
  if (!pending) return null;
  if (pending.ai) {
    const yes = new Set(pending.question.yes);
    const no = new Set(pending.question.no);
    return word => (yes.has(word) ? 'yes' : no.has(word) ? 'no' : null);
  }
  const { labels } = game.questions;
  const { code } = pending.question;
  return word => {
    const codes = labels.get(word);
    return codes === undefined ? null : codes.includes(code) ? 'yes' : 'no';
  };
}

// Her question, in the notebook: the stake, the small print, and the player's three choices.
function QuestionCard({ game, onAnswer }) {
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const { question } = game.pending;
  return <div className="obs-question" role="group" aria-labelledby="obs-question-title" aria-describedby="obs-question-stake">
    <h3 id="obs-question-title" ref={heading} tabIndex={-1}>{question.question}</h3>
    <p id="obs-question-stake" className="obs-question-stake">{offerStake(game)}</p>
    <div className="obs-question-answers">
      {ANSWERS.map(choice => <button key={choice.id} type="button" onClick={() => onAnswer(choice.id)}>{choice.label}</button>)}
    </div>
    <p className="obs-muted">{game.pending.ai ? AI_NOTE : questionSmallPrint(question)}</p>
  </div>;
}

function Reasoning({ round, mind, tier, playing }) {
  if (!playing || mind.failed) return null;
  if (mind.consulting) return <p className="obs-reasoning">She is asking her AI helper for a question about the words she still has in mind.</p>;
  if (mind.turn?.type === 'question' || mind.turn?.type === 'consult') return <p className="obs-reasoning">Instead of a letter, she is choosing a question to ask you.</p>;
  if (!mind.decision) return null;
  return <p className="obs-reasoning">{notebookLine(mind.decision, { tierLabel: tier.label, length: round.answer.length, fallbackShare: mind.fallbackShare })}</p>;
}

// What the round earned, in the notebook's summary: the server's award for a win (or why there
// is none), and what happens to the ladder.
function RoundResult({ game, status, claim, retry }) {
  const { ticket } = game;
  if (!ticket) return <p className="obs-muted">This duel was not scored.</p>;
  if (game.experimental) return <p className="obs-muted">Experimental duels earn no points.</p>;
  if (status === 'solved') return <p className="obs-muted">No points this time.{ticket.ladder?.rung > 0 ? ' Your ladder resets.' : ''}</p>;
  if (!claim || claim.saving) return <p role="status">Saving…</p>;
  if (claim.error) return <>
    <p role="alert" className="obs-error">{claim.error}</p>
    {claim.canRetry && <button type="button" className="obs-retry" onClick={retry}>Retry saving</button>}
  </>;
  const { awarded, score, reason, ladder } = claim.result;
  let points;
  if (awarded.stump > 0) {
    const ladderPart = awarded.ladder > 0 ? `, and +${awarded.ladder} for completing your ladder` : '';
    points = `+${awarded.stump} points${ladderPart}. Your total is ${score.toLocaleString('en-US')}.`;
  } else if (reason === ILLUCIA_NO_POINTS.alreadyWon) points = ILLUCIA_ALREADY_WON_MESSAGE;
  else if (reason === ILLUCIA_NO_POINTS.outsideTier) points = `${game.tier.label} does not know ${game.round.answer.toUpperCase()}, so this win earns no points.`;
  else points = 'This win earns no points.';
  return <>
    <p className="obs-award" role="status">{points}</p>
    {ladder?.rung > 0 && <p className="obs-muted">Ladder: next, {tierLabel(ladder.next)} with a word of {ladder.minLength}+ letters.</p>}
  </>;
}

function Game({ game, mind, paused, setPaused, fast, setFast, restart, rematch, claim, retry, spent, answer, showRecord }) {
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
  const possible = mind.candidates.length <= 10 ? mind.candidates : null;
  // Leaving a scored round counts as a loss and resets the ladder, so it takes a second press.
  const [confirming, setConfirming] = useState(false);
  const scored = Boolean(game.ticket) && playing;
  const points = !game.ticket ? 'Not scored' : game.points?.eligible ? `${previewPoints(game)} pts` : 'No points';
  const climb = status === 'failed' && claim?.result?.ladder?.rung > 0 ? claim.result.ladder : null;
  // Once a word has paid, the same word earns nothing at any level.
  const practice = spent.has(round.answer);

  return <>
    <div className="obs-grid">
      <Pod lit={game.lit} fading={game.fading} learned={game.knowledge.learned} sideOf={questionSides(game)} count={mind.candidates.length} tier={tier.label}
        points={points} mood={mood} thinking={(playing && !paused) || Boolean(game.consult)} turn={turns.length} line={game.line}
        banner={status === 'solved' ? { text: 'Illucia wins', tone: 'lose' } : status === 'failed' ? { text: 'You win!', tone: 'win' } : null} />
      <section className="obs-screen">
        <div className="obs-screen-inner">
          <h2 ref={heading} tabIndex={-1}>{status === 'solved' ? 'Illucia wins' : status === 'failed' ? 'You win!' : "Illucia's notebook"}</h2>
          {status === 'playing'
            ? <>
              <p className="obs-muted">{game.pending ? (game.pending.ai ? 'Her AI helper\'s question · green stars: its yes, blue: its no'
                : 'Her question · green stars can mean it, blue cannot, white: unknown to her archive')
                : `Her letter scores · turn ${turns.length + 1}${mind.cutoff !== null && playing ? ' · above the dashed line: her shortlist' : ''}`}{paused ? ' · paused' : ''}</p>
              <p className="obs-stakes">{game.stakes}</p>
            </>
            : <p className="obs-reveal">The word was <strong>{round.answer.toUpperCase()}</strong></p>}
          {game.pending ? <QuestionCard game={game} onAnswer={answer} /> : <>
            <Analyzer round={round} mind={mind} playing={playing} />
            <p className="obs-sr">{playing && mind.decision ? `Her next guess is ${mind.decision.letter.toUpperCase()}.` : ''}</p>
            <Reasoning round={round} mind={mind} tier={tier} playing={playing} />
          </>}
          {mind.failed && <p role="alert" className="obs-error">Illucia could not continue this round. Please choose another word.</p>}
          {status !== 'playing' && <div className="obs-summary">
            <p>{status === 'solved' ? `She solved it in ${turns.length} guesses with ${remaining} ${remaining === 1 ? 'miss' : 'misses'} to spare.` : `You held out for six misses. She guessed ${turns.length - MAX_MISSES} ${turns.length - MAX_MISSES === 1 ? 'letter' : 'letters'} right.`}</p>
            <p>Final suspects: {mind.candidates.length ? mind.candidates.slice(0, 5).join(', ') : `none left in her ${tier.label} vocabulary`}{mind.candidates.length > 5 ? ` (5 of ${mind.candidates.length})` : ''}.</p>
            <RoundResult game={game} status={status} claim={claim} retry={retry} />
          </div>}
          {status === 'playing' && possible && possible.length > 0 && <p className="obs-shortlist">Words still possible: {possible.join(' · ')}</p>}
        </div>
      </section>
    </div>

    <div className="obs-word" role="img" style={{ '--len': round.answer.length }}
      aria-label={`Word: ${pattern.map(letter => letter || 'blank').join(' ')}`}>
      {pattern.map((letter, index) => {
        const shown = letter || (status !== 'playing' ? round.answer[index] : null);
        return <span key={index} className={letter ? 'found' : shown ? 'kept' : ''} aria-hidden="true">{shown || ' '}</span>;
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
        {status === 'failed' && nextTier && <button type="button" onClick={() => rematch(nextTier)}>
          Rematch vs {nextTier.label}{practice ? ' (practice, 0 points)' : ''}</button>}
        <button type="button" className="obs-new" onClick={() => (scored && !confirming ? setConfirming(true) : restart())}>
          {status !== 'playing' ? (climb ? `Climb to ${tierLabel(climb.next)} (${climb.minLength}+ letters)` : 'Play again')
            : scored && confirming ? 'Leave? Counts as a loss' : 'New word'}</button>
        {status !== 'playing' && <button type="button" onClick={showRecord}>Your record</button>}
      </div>
    </section>
    <p role="status" aria-live="polite" aria-atomic="true" className="obs-sr">{game.pending ? `She asks: ${game.pending.question.question}` : latest
      ? `Turn ${turns.length}: ${latest.letter.toUpperCase()}, ${latest.positions ? `hit, ${latest.positions} ${latest.positions === 1 ? 'position' : 'positions'}` : 'miss'}. ${remaining} misses left.${status === 'solved' ? ' Illucia wins.' : status === 'failed' ? ' You win.' : ''}`
      : 'The duel has begun.'}</p>
  </>;
}

function ObservatoryPage({ userId, username }) {
  const [game, setGame] = useState(null);
  const [paused, setPaused] = useState(false);
  const [fast, setFast] = useState(false);
  const rounds = useIlluciaRounds(userId, game);
  const [recordOpen, setRecordOpen] = useState(false);
  // Off on every page load; kept for the next duel on this page only.
  const [experimental, setExperimental] = useState(false);
  const mind = useMemo(() => game && readMind(game), [game]);

  // Her letter, played when her pause is over (the turn was decided in readMind).
  useEffect(() => {
    if (!game || !['letter', 'question', 'consult'].includes(mind?.turn?.type) || paused) return;
    const delay = game.turns.length === 0 ? 2200 : fast ? 700 : 1700;
    const timer = setTimeout(() => {
      if (mind.turn.type === 'consult') {
        setGame({ ...mind.turn.session, consult: mind.turn.candidates });
        return;
      }
      if (mind.turn.type === 'question') {
        setGame({ ...mind.turn.session, line: questionLine(mind.turn.question, game.round.guesses.length) });
        return;
      }
      const { session, letter, positions } = mind.turn;
      const { round } = session;
      const candidates = filterCandidates(toPublicState(round), herKnowledge(session).words);
      const lit = brightestStars(candidates, session.knowledge.learned);
      const litSet = new Set(lit);
      const status = getRoundStatus(round);
      // Once the word is out, her memory of it (learned from this player, or played before).
      const memory = status === 'playing' ? null : rememberLine(session, status === 'failed');
      setGame({
        ...session, lit,
        fading: game.lit.filter(word => !litSet.has(word)),
        turns: [...game.turns, { letter, positions: positions.length }],
        line: [turnLine(round, positions.length, candidates.length, game.turns, game.tier.label), memory].filter(Boolean).join(' '),
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [game, mind, paused, fast]);

  // Experimental mode: ask her AI helper; a stale reply (new word, page left) is dropped.
  useEffect(() => {
    if (!game?.consult) return;
    const controller = new AbortController();
    const asked = game;
    askIlluciaAi({ roundId: asked.ticket.roundId, candidates: asked.consult, signal: controller.signal })
      .then(reply => setGame(current => {
        if (current !== asked) return current;
        const turn = current.round.guesses.length;
        const next = { ...applyConsult(current, reply), consult: null };
        return { ...next, line: reply.ok ? aiQuestionLine(reply.question, turn) : aiFallbackLine(reply.reason, turn) };
      }))
      .catch(() => {});
    return () => controller.abort();
  }, [game]);

  // The round is over: the game no longer changes, so this runs once per round.
  useEffect(() => { if (game && getRoundStatus(game.round) !== 'playing') rounds.finish(game); }, [game]);

  async function begin(word, assets, tier, mode = experimental) {
    const started = await rounds.start(word, tier, mode);
    if (!started) return;
    setPaused(false);
    setGame(newGame(word, assets, tier, started.ticket));
  }

  // The player answers or declines her question; the words it rules out fade from her sky.
  function answer(choiceId) {
    const result = answerQuestion(game, choiceId);
    if (!result) return;
    const { session } = result;
    const candidates = filterCandidates(toPublicState(session.round), herKnowledge(session).words);
    const lit = brightestStars(candidates, session.knowledge.learned);
    const litSet = new Set(lit);
    const turn = game.round.guesses.length;
    setGame({ ...session, lit, fading: game.lit.filter(word => !litSet.has(word)),
      line: result.ai ? aiAnswerLine(result.outcome === 'declined', turn) : answerLine(result.outcome, turn, result.truth) });
  }

  const restart = () => {
    // Leaving a scored round before it is over abandons it.
    if (game?.ticket && getRoundStatus(game.round) === 'playing') rounds.abandon();
    setGame(null);
    setPaused(false);
    setRecordOpen(false);
  };
  return <main className="obs-page">
    <header className="obs-heading">
      <h1>Illucia</h1>
      <p>Daughter of Professor Han Fastolfe · Aurora</p>
    </header>
    {game
      ? <Game key={game.ticket?.roundId ?? game.seed} game={game} mind={mind} paused={paused} setPaused={setPaused} fast={fast} setFast={setFast}
        restart={restart} rematch={tier => begin(game.round.answer, game.assets, tier, game.experimental)} answer={answer}
        showRecord={() => { setGame(null); setRecordOpen(true); }}
        claim={rounds.claimFor(game)} retry={() => rounds.retry(game)} spent={rounds.spent} />
      : <Setup username={username} onStart={begin} ladder={rounds.ladder} spent={rounds.spent} recordOpen={recordOpen} setRecordOpen={setRecordOpen}
        experimental={experimental} setExperimental={setExperimental} />}
    <p className="obs-credits">Vocabulary: ESDB/SCOWL · filtered with LDNOOBW · questions: Open English WordNet (CC BY 4.0). <a href="/illucia/credits.html" target="_blank" rel="noreferrer">Credits &amp; licences</a></p>
  </main>;
}
