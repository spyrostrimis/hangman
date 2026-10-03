import React, { useEffect, useMemo, useRef, useState } from 'react';
import RegisteredOnly from './RegisteredOnly';
import { useAuth } from './AuthProvider';
import { applyGuess, createRound, getPattern, getRemainingMisses, getRoundStatus, MAX_MISSES } from '../lib/hangman-core.js';
import { MAX_WORD_LENGTH, MIN_WORD_LENGTH, VOCABULARY_TIERS, createKnowledge, isAcceptedWord, isWordShape, parseLexicon } from '../lib/illucia/lexicon.js';
import { toPublicState } from '../lib/illucia/public-state.js';
import { filterCandidates } from '../lib/illucia/candidates.js';
import { analyzeDecision } from '../lib/illucia/strategy.js';
import { newLocalSeed } from '../lib/illucia/random.js';
import { checkAnswer, chooseQuestion, narrowKnowledge, parseCategories, parseLabels } from '../lib/illucia/questions.js';
import { rejectionLine } from '../lib/illucia/lines.js';
import { greetingLine, openingLine } from '../lib/illucia/observatory-lines.js';
import { ANSWERS, REPLIES, answerLine, askLine, questionLine, questionNote, reasonLine, replyLine, solvedLine } from '../lib/illucia/duel-lines.js';
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
  return <DuelPage key={user.id} username={user.username} />;
}

const countWords = (round, knowledge) => filterCandidates(toPublicState(round), knowledge.words).length;

// Her vocabulary after the questions answered so far (unknown words stay on both sides).
const herKnowledge = duel => (duel.questions
  ? narrowKnowledge(duel.knowledge, duel.questions.labels, duel.offers, duel.questions.categories) : duel.knowledge);

// assets: { entries, questions: { labels, categories } | null }. Without labels she asks nothing.
function newDuel(word, assets, tier) {
  const knowledge = createKnowledge(assets.entries, tier.maxSize);
  const round = createRound(word);
  return {
    // A local seed for her temperament until the server's round seed arrives (E3).
    round, assets, entries: assets.entries, questions: assets.questions, knowledge, tier, seed: newLocalSeed(),
    phase: 'thinking', lastGuess: null, lastHit: null,
    // Questions offered so far ({ code, answer }), the guess count when she last asked, and the
    // answers that were checked against WordNet and right (they earn the bonus).
    offers: [], askedAt: -1, verified: 0, pending: null,
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
      // Only the length is sent. Never put the secret in a URL or request body.
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
      setSecret('');
      onStart(word, { entries, questions }, VOCABULARY_TIERS.find(value => value.id === tierId));
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
      <p id="duel-trust" className="duel-muted">{secret.trim() ? `${secret.trim().length} letters · ` : ''}Illucia plays blind, from the blanks alone.</p>
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

// Her question is a bet: answering helps her, declining tells her nothing. When WordNet does
// not know the player's word, the answer cannot be checked, and the card says so first.
function Offer({ pending, onAnswer }) {
  return <div className="duel-msg from-player">
    <div className="duel-replies duel-offer" role="group" aria-label="Answer her question" aria-describedby="duel-offer-stake">
      <span className="duel-label">Her question · your choice</span>
      <p id="duel-offer-stake" className="duel-stake">{pending.checkable
        ? 'Answering helps her. Declining tells her nothing.'
        : 'My archive does not know your word, so your answer cannot be checked: no bonus possible for this word.'}</p>
      {ANSWERS.map(choice => <button key={choice.id} type="button" onClick={() => onAnswer(choice.id)}>{choice.label}</button>)}
    </div>
  </div>;
}

function StatusBar({ duel, restart }) {
  const remaining = getRemainingMisses(duel.round);
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
      <p className="duel-muted">Duels don't earn Hall of Fame points yet.</p>
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
      {!duel && <div className="duel-msg from-player"><Composer onStart={(word, assets, tier) => setDuel(newDuel(word, assets, tier))} /></div>}
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
      {duel?.phase === 'question' && <Offer pending={duel.pending} onAnswer={id => setDuel(current => answer(current, id))} />}
      {duel?.phase === 'error' && <div className="duel-result-actions"><button type="button" className="hm-button primary" onClick={restart}>New word</button></div>}
    </div>

    {duel?.phase === 'over' && <Result duel={duel} restart={restart}
      rematch={tier => setDuel(newDuel(duel.round.answer, duel.assets, tier))} />}

    <div ref={bottom} className="duel-bottom" />
    <p className="duel-credits">Vocabulary: ESDB/SCOWL · filtered with LDNOOBW · questions: Open English WordNet (CC BY 4.0). <a href="/illucia/credits.html" target="_blank" rel="noreferrer">Credits &amp; licences</a></p>
  </div>;
}
