import React, { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Illucia from './Illucia';
import { analyzeDecision } from '../lib/illucia/strategy.js';
import { reasonLine, replyLine } from '../lib/illucia/duel-lines.js';
import { newLocalSeed } from '../lib/illucia/random.js';
import { ILLUCIA_ALREADY_WON_MESSAGE, illuciaStumpPoints } from '../../../shared/scoring-protocol.js';

const auth = vi.hoisted(() => ({ user: { id: 'test-player', username: 'tester' }, status: 'authenticated' }));
vi.mock('./AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('../lib/illucia/strategy.js', async original => ({ ...await original(), analyzeDecision: vi.fn() }));
vi.mock('../lib/illucia/random.js', async original => ({ ...await original(), newLocalSeed: vi.fn(() => 1234) }));
beforeEach(async () => {
  auth.updateScore = vi.fn();
  auth.expireSession = vi.fn();
  const real = (await vi.importActual('../lib/illucia/strategy.js')).analyzeDecision;
  analyzeDecision.mockImplementation(real);
  analyzeDecision.mockClear();
  newLocalSeed.mockClear();
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => 'eerie 35\n' }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const mount = () => render(<StrictMode><MemoryRouter><Illucia /></MemoryRouter></StrictMode>);
async function start(word = 'EERIE', tier = 'Master') {
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(tier) }));
  fireEvent.change(screen.getByLabelText('Your secret word'), { target: { value: word } });
  await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Start the duel' }).closest('form')); });
  // An out-of-tier word asks first ("Start anyway"); these tests start regardless.
  const anyway = screen.queryByRole('button', { name: 'Start anyway' });
  if (anyway) await act(async () => { fireEvent.submit(anyway.closest('form')); });
}
// Longer than her thinking pause, so at most one guess happens per call.
const think = () => act(async () => { await vi.advanceTimersByTimeAsync(1200); });
const hiddenTiles = () => screen.queryAllByRole('button', { name: /^Show [A-Z] at position/ });
const boards = container => [...container.querySelectorAll('.duel-board')].map(board =>
  [...board.querySelectorAll('.duel-tile')].map(tile => (tile.classList.contains('hidden') ? '#' : tile.textContent || '_')).join(''));
const staticCalls = () => fetch.mock.calls.filter(([url]) => !url.startsWith('/user/'));
const bubbles = (container, from) => [...container.querySelectorAll(`.from-${from} .duel-bubble p`)].map(node => node.textContent);

it('sends only the length, hides her hits until the player shows them, and plays to her win', async () => {
  const view = mount();
  expect(screen.getByLabelText('Your secret word').type).toBe('text');
  expect(view.container.querySelector('input[type="password"]')).toBeNull();
  await start();
  // Her words and her question labels for this length: never the secret, only the length.
  expect(staticCalls().map(call => call[0]).sort())
    .toEqual(['/illucia/labels/5.txt', '/illucia/labels/categories.json', '/illucia/words/5.txt']);
  for (const [, options] of staticCalls()) expect(Object.keys(options)).toEqual(['signal']);
  // Only the round start carries the word, in a same-origin JSON body (disclosed on /privacy).
  const carrying = fetch.mock.calls.filter(([url, options]) => url.includes('eerie') || options.body?.includes('eerie'));
  expect(carrying.map(([url, options]) => [url, options.method, JSON.parse(options.body).word]))
    .toEqual([['/user/illucia/start', 'POST', 'eerie']]);

  await think();
  const state = analyzeDecision.mock.calls[0][0];
  expect(state.pattern).toEqual([null, null, null, null, null]);
  expect(state).not.toHaveProperty('answer');
  expect(JSON.stringify(state)).not.toContain('eerie');
  // E is at positions 1, 2 and 5: three grey tiles, nothing else shown yet.
  expect(boards(view.container).at(-1)).toBe('##__#');
  expect(hiddenTiles().map(tile => tile.getAttribute('aria-label')))
    .toEqual(['Show E at position 1', 'Show E at position 2', 'Show E at position 5']);

  // She waits while tiles remain hidden.
  fireEvent.click(hiddenTiles()[0]);
  fireEvent.click(hiddenTiles()[0]);
  await think(); await think();
  expect(analyzeDecision).toHaveBeenCalledTimes(1);
  expect(boards(view.container).at(-1)).toBe('EE__#');
  fireEvent.click(hiddenTiles()[0]);
  expect(boards(view.container).at(-1)).toBe('EE__E');
  await think();
  expect(analyzeDecision).toHaveBeenCalledTimes(2);
  expect(bubbles(view.container, 'illucia').at(-1)).toMatch(/^Three of them\./);

  while (!screen.queryByRole('heading', { name: 'Illucia wins' })) {
    const [tile] = hiddenTiles();
    if (tile) fireEvent.click(tile); else await think();
  }
  expect(boards(view.container).at(-1)).toBe('EERIE');
  // The start failed in this fixture, so the duel was not scored and nothing is claimed.
  expect(view.container.querySelector('.duel-stakes').textContent).toBe('This duel is not scored: the scorekeeper could not be reached.');
  expect(fetch.mock.calls.some(([url]) => url === '/user/illucia/claim')).toBe(false);
  const calls = analyzeDecision.mock.calls.length;
  await think();
  expect(analyzeDecision.mock.calls.length).toBe(calls);
  fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
  expect(screen.getByLabelText('Your secret word').value).toBe('');
});

it('waits for the player to answer a miss, answers that reply, and ends at six misses', async () => {
  // Her first guess (A or B) misses WXYZ and rules out all three words she knows; her fallback
  // then picks among C-H, so every letter misses whichever seed settles the ties.
  fetch.mockResolvedValue({ ok: true, text: async () => 'abcd 35\nabef 35\nabgh 35\nwxyz 70\n' });
  const view = mount(); await start('wxyz', 'Apprentice');
  await think();
  expect(analyzeDecision.mock.calls[0][1].words).toEqual(['abcd', 'abef', 'abgh']);
  // Her letters, and the share the page shows: of her candidates, or of her words in a fallback.
  const herLetter = call => analyzeDecision.mock.results[call].value.letter;
  const herShare = call => {
    const decision = analyzeDecision.mock.results[call].value;
    return decision.fallback
      ? Math.round(['abcd', 'abef', 'abgh'].filter(word => word.includes(decision.letter)).length / 3 * 100)
      : Math.round(decision.hitCount / decision.candidateCount * 100);
  };
  expect(hiddenTiles()).toHaveLength(0);
  // Positive control on the same round: a miss offers both replies and she waits.
  expect(screen.getByRole('button', { name: 'Oops, wrong' })).toBeTruthy();
  await think(); await think();
  expect(analyzeDecision).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: "That wasn't so smart ;)" }));
  expect(bubbles(view.container, 'player').at(-1)).toBe("That wasn't so smart ;)");
  const first = herLetter(0);
  const smart = replyLine('smart', { letter: first, turn: 1, count: 0, share: herShare(0), length: 4, missesLeft: 5 });
  expect(bubbles(view.container, 'illucia').at(-1)).toBe(smart);
  expect(view.container.querySelectorAll('.duel-board-caption')[1].textContent).toBe(`Turn 1 · ${first.toUpperCase()} · miss`);

  await think();
  fireEvent.click(screen.getByRole('button', { name: 'Oops, wrong' }));
  const second = herLetter(1);
  const oops = replyLine('oops', { letter: second, turn: 2, count: 0, share: herShare(1), length: 4, missesLeft: 4 });
  expect(bubbles(view.container, 'illucia').at(-1)).toBe(oops);
  expect(oops).not.toBe(smart);

  for (let miss = 3; miss <= 6; miss++) {
    await think();
    fireEvent.click(screen.getByRole('button', { name: 'Oops, wrong' }));
  }
  expect(screen.getByRole('heading', { name: 'You win' })).toBeTruthy();
  expect(screen.getByRole('img', { name: 'Her chances: 0 of 6' })).toBeTruthy();
  expect(view.container.querySelectorAll('.duel-board').length).toBe(7);
  expect([...view.container.querySelectorAll('.duel-board')].at(-1).querySelectorAll('.duel-tile.missed')).toHaveLength(4);
  expect(screen.getByRole('button', { name: 'Rematch vs Scholar' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Oops, wrong' })).toBeNull();
  expect(screen.getByText('This duel was not scored.')).toBeTruthy();
  // Static files for this length only (the out-of-tier warning's second press loads them again).
  expect(new Set(staticCalls().map(call => call[0])))
    .toEqual(new Set(['/illucia/words/4.txt', '/illucia/labels/4.txt', '/illucia/labels/categories.json']));
});

it('shows her count from before the guess until the player reveals the tiles', async () => {
  fetch.mockResolvedValue({ ok: true, text: async () => 'eerie 35\nsense 35\nthree 35\n' });
  const view = mount(); await start('eerie');
  const words = () => view.container.querySelector('.duel-status-facts b').textContent;
  expect(words()).toBe('3');
  await think();
  // Her note explains this decision, from its own record: the facts, then why.
  const first = analyzeDecision.mock.results[0].value;
  const note = view.container.querySelector('.duel-bubble small').textContent;
  expect(first.candidateCount).toBe(3);
  expect(note).toBe(reasonLine({ letter: first.letter, share: Math.round(first.hitCount / 3 * 100),
    candidates: 3, fallback: first.fallback, tierLabel: 'Master', length: 5, decision: first }));
  expect(note).toMatch(/words I still have in mind\. \S/);
  expect(hiddenTiles().length).toBeGreaterThan(0);
  expect(words()).toBe('3');
  hiddenTiles().forEach(tile => fireEvent.click(tile));
  expect(words()).toBe('1');
});

it('cancels her pending turn on New word and shows a recoverable error if the solver fails', async () => {
  mount(); await start();
  fireEvent.click(screen.getByRole('button', { name: 'New word' }));
  await think();
  expect(analyzeDecision).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Your secret word')).toBeTruthy();

  await start();
  analyzeDecision.mockImplementationOnce(() => { throw new Error('Master invariant: zero candidates.'); });
  await think();
  expect(screen.getByText(/Something went wrong in my notes/)).toBeTruthy();
  expect(screen.queryByRole('heading', { name: /wins|You win/ })).toBeNull();
  await think();
  expect(analyzeDecision).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getAllByRole('button', { name: 'New word' }).at(-1));
  expect(screen.getByLabelText('Your secret word')).toBeTruthy();
});

it('rejects invalid and unlisted words without starting', async () => {
  mount(); await start('two words');
  expect(screen.getByRole('alert').textContent).toContain('A–Z only');
  expect(staticCalls()).toHaveLength(0);
  await start('zzzzz');
  expect(screen.getByRole('alert').textContent).toContain('cannot accept');
  expect(fetch.mock.calls.some(call => call[0].includes('zzzzz'))).toBe(false);
  expect(screen.getByLabelText('Your secret word')).toBeTruthy();
});

it('asks for 4-15 letters and never fetches a 3-letter word file', async () => {
  mount(); await start('cat');
  expect(screen.getByRole('alert').textContent).toBe('Choose 4–15 letters, A–Z only, with no spaces or punctuation.');
  expect(staticCalls()).toHaveLength(0);
  // Positive control: four letters pass the shape check and load that length.
  fetch.mockResolvedValue({ ok: true, text: async () => 'cats 35\n' });
  await start('cats');
  expect(fetch.mock.calls.map(call => call[0])).toContain('/illucia/words/4.txt');
  expect(screen.queryByRole('alert')).toBeNull();
});

it('gives each round its own seed and passes it to every decision', async () => {
  mount(); await start();
  await think();
  expect(newLocalSeed).toHaveBeenCalledTimes(1);
  expect(analyzeDecision.mock.calls.length).toBeGreaterThan(0);
  expect(analyzeDecision.mock.calls.every(call => call[2]?.seed === 1234)).toBe(true);
  // A new word is a new round with a new seed.
  fireEvent.click(screen.getByRole('button', { name: 'New word' }));
  await start();
  expect(newLocalSeed).toHaveBeenCalledTimes(2);
});

it('calls her miss a hunch, not the smart move, when she chose below her best', async () => {
  fetch.mockResolvedValue({ ok: true, text: async () => 'abcd 35\nabef 35\nabgh 35\nwxyz 70\n' });
  const real = (await vi.importActual('../lib/illucia/strategy.js')).analyzeDecision;
  const lastLine = async () => {
    const view = mount(); await start('wxyz', 'Apprentice');
    for (let miss = 1; miss <= 4; miss++) {
      await think();
      // Turn 4 is her first "smart" line.
      fireEvent.click(screen.getByRole('button', { name: miss === 4 ? "That wasn't so smart ;)" : 'Oops, wrong' }));
    }
    const line = bubbles(view.container, 'illucia').at(-1);
    cleanup();
    return line;
  };
  // Positive control: her real decisions on this board are best letters.
  expect(await lastLine()).toBe('Statistically it was the smart move. Statistics can be rude.');
  analyzeDecision.mockImplementation((...args) => ({ ...real(...args), choseBest: false }));
  expect(await lastLine()).toBe('It was a hunch. Hunches can be rude.');
});

// Questions (v2 E2). Four birds and four other words; she knows them all. The secret's label
// decides whether an answer can be checked.
const QUESTION_WORDS = ['chair', 'crane', 'eagle', 'heron', 'plate', 'robin', 'stone', 'table'];
const CATEGORIES = { categories: [
  { code: 'c', key: 'bird', kind: 'noun', question: 'Can your word mean a bird?', kindOf: { 'oewn-01505702-n': 'bird' } },
  { code: 'o', key: 'artifact', kind: 'noun', question: 'Can your word mean a man-made object?', lexfiles: ['noun.artifact'] },
] };
const BIRDS = new Set(['crane', 'eagle', 'heron', 'robin']);
// mammals: a second narrow category (chair and plate, as a fixture) that qualifies straight after the first.
const MAMMAL = { code: 'd', key: 'mammal', kind: 'noun', question: 'Can your word mean a mammal?', kindOf: { 'oewn-01864419-n': 'mammal' } };
function serveQuestions({ unknown = null, labels = true, mammals = false } = {}) {
  const words = QUESTION_WORDS.map(word => `${word} 35\n`).join('');
  const code = word => (BIRDS.has(word) ? 'c' : mammals && ['chair', 'plate'].includes(word) ? 'do' : 'o');
  const lines = QUESTION_WORDS.filter(word => word !== unknown).map(word => `${word} ${code(word)}\n`).join('');
  const categories = mammals ? { categories: [CATEGORIES.categories[0], MAMMAL, CATEGORIES.categories[1]] } : CATEGORIES;
  fetch.mockImplementation(async url => {
    if (url === '/illucia/words/5.txt') return { ok: true, text: async () => words };
    if (url === '/illucia/labels/5.txt') return labels ? { ok: true, text: async () => lines } : { ok: false };
    if (url === '/illucia/labels/categories.json') return { ok: true, json: async () => categories };
    return { ok: false };
  });
}
// Her first two letters miss every word (Z, then Q), so all eight are still possible when she may ask.
async function forceMisses(real, forced = ['z', 'q']) {
  analyzeDecision.mockImplementation((state, knowledge, options) => {
    const decision = real(state, knowledge, options);
    return forced.length ? { ...decision, letter: forced.shift() } : decision;
  });
  for (let miss = 0; miss < 2; miss++) {
    await think();
    fireEvent.click(screen.getByRole('button', { name: 'Oops, wrong' }));
  }
  await think();
  return forced;
}
const choices = () => screen.queryAllByRole('button', { name: /^(Yes, it can|No, it can't|Decline)$/ }).map(button => button.textContent);
const realDecision = async () => (await vi.importActual('../lib/illucia/strategy.js')).analyzeDecision;

it('asks a curious question after two letters, corrects a wrong answer and filters on the archive', async () => {
  serveQuestions();
  const view = mount(); await start('crane');
  await forceMisses(await realDecision());
  // Positive control: before the question she considered all eight words.
  expect(analyzeDecision.mock.calls.at(-1)[1].words).toEqual(QUESTION_WORDS);
  const calls = analyzeDecision.mock.calls.length;
  // The broad category is held back (4 misses left), so the narrow one comes first, curiously.
  expect(bubbles(view.container, 'illucia').at(-1)).toMatch(/Can your word mean a bird\?$/);
  expect(bubbles(view.container, 'illucia').at(-1)).not.toMatch(/Desperate|broad/);
  expect(view.container.querySelectorAll('.duel-bubble small')[2].textContent).toContain('Open English WordNet (CC BY 4.0)');
  expect(choices()).toEqual(['Yes, it can', "No, it can't", 'Decline']);
  expect(screen.getByText('Answering helps her. Declining tells her nothing.')).toBeTruthy();
  expect(analyzeDecision.mock.calls.length).toBe(calls); // the question used her turn

  fireEvent.click(screen.getByRole('button', { name: "No, it can't" }));
  expect(bubbles(view.container, 'player').at(-1)).toBe("No, it can't.");
  expect(bubbles(view.container, 'illucia').at(-1)).toMatch(/^My archive says otherwise: your word can mean that\./);
  expect(choices()).toEqual([]);
  // Her next move is a letter, not another question, over the birds only.
  await think();
  expect(analyzeDecision.mock.calls.length).toBe(calls + 1);
  expect(analyzeDecision.mock.calls.at(-1)[1].words).toEqual(['crane', 'eagle', 'heron', 'robin']);
  expect(screen.getByText(/questions: Open English WordNet \(CC BY 4\.0\)/)).toBeTruthy();
});

it('says no bonus is possible for a word WordNet does not know, and takes the answer on trust', async () => {
  serveQuestions({ unknown: 'crane' });
  const view = mount(); await start('crane');
  await forceMisses(await realDecision());
  expect(screen.getByText(/no bonus possible for this word/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Yes, it can' }));
  expect(bubbles(view.container, 'illucia').at(-1)).toBe('My archive does not know your word, so I will take your word for it.');
  await think();
  // The unknown word stays on both sides; YES keeps the labelled birds.
  expect(analyzeDecision.mock.calls.at(-1)[1].words).toEqual(['crane', 'eagle', 'heron', 'robin']);
});

it('learns nothing from a declined question, asks at most once per letter, and plays letters only when the labels cannot load', async () => {
  serveQuestions({ mammals: true });
  const view = mount(); await start('crane');
  await forceMisses(await realDecision());
  expect(bubbles(view.container, 'illucia').at(-1)).toMatch(/a bird\?$/);
  fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
  expect(bubbles(view.container, 'player').at(-1)).toBe("I'd rather not say.");
  // The mammal question qualifies now, but she guesses a letter first.
  const calls = analyzeDecision.mock.calls.length;
  await think();
  expect(analyzeDecision.mock.calls.length).toBe(calls + 1);
  expect(analyzeDecision.mock.calls.at(-1)[1].words).toEqual(QUESTION_WORDS);
  cleanup();

  serveQuestions({ labels: false });
  mount(); await start('crane');
  await forceMisses(await realDecision());
  expect(choices()).toEqual([]);
  expect(analyzeDecision).toHaveBeenCalledTimes(calls + 4);
});

it('holds the broad question until two chances are left, then asks it desperately', async () => {
  serveQuestions();
  const view = mount(); await start('crane');
  const forced = await forceMisses(await realDecision(), ['z', 'q', 'j', 'x']);
  fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
  // Turn 3 (three chances left): no question, the broad one is still held.
  await think();
  expect(choices()).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Oops, wrong' }));
  await think();
  fireEvent.click(screen.getByRole('button', { name: 'Oops, wrong' }));
  expect(forced).toEqual([]);
  await think();
  expect(screen.getByRole('img', { name: 'Her chances: 2 of 6' })).toBeTruthy();
  expect(bubbles(view.container, 'illucia').at(-1)).toMatch(/Can your word mean a man-made object\?$/);
  expect(bubbles(view.container, 'illucia').at(-1)).toMatch(/^(Two chances left\. Time for broad strokes|I am running out of chances|Fine\. A broad one)/);
  expect(choices()).toEqual(['Yes, it can', "No, it can't", 'Decline']);
});

// Server rounds (v2 E3). The API is mocked: stats, start and claim answer with the shapes the
// Worker sends; every other request falls through to the fixture's static files.
const ZERO_LETTERS = Object.fromEntries([...'abcdefghijklmnopqrstuvwxyz'].map(letter => [letter, 0]));
const RESET = { rung: 0, next: 'apprentice', minLength: 4 };
function ticketFor(body, extra = {}) {
  return { roundId: `round-${body.word}-${body.tier}`, word: body.word, tier: body.tier, experimental: false, seed: 4242,
    issuedAt: 1000, expiresAt: 1000 + 1800000, serverNow: 16000,
    points: { eligible: true, stump: illuciaStumpPoints(body.tier, body.word.length, 0) }, ladder: RESET,
    memory: { brain: { personalitySeed: 7, games: 3, letters: { ...ZERO_LETTERS, e: 2 }, learned: [] },
      voice: { plays: 0, beatenBefore: false, everyone: 0 } }, ...extra };
}
function serveApi(handlers) {
  const base = fetch.getMockImplementation();
  const requests = [];
  fetch.mockImplementation(async (url, options = {}) => {
    if (url.startsWith('/user/')) {
      const body = options.body ? JSON.parse(options.body) : null;
      requests.push([url, body]);
      const [status, data] = handlers[url] ? await handlers[url](body, requests) : [404, { message: 'Not found.' }];
      return { ok: status < 400, status, json: async () => data };
    }
    return base(url, options);
  });
  return requests;
}
// Plays her six misses with forced letters (none in the fixture's words), declining any question.
async function playToHerLoss(real, letters = ['z', 'q', 'j', 'x', 'v', 'k']) {
  const forced = [...letters];
  analyzeDecision.mockImplementation((state, knowledge, options) => {
    const decision = real(state, knowledge, options);
    return forced.length ? { ...decision, letter: forced.shift() } : decision;
  });
  for (let miss = 0; miss < letters.length;) {
    await think();
    if (screen.queryByRole('button', { name: 'Decline' })) { fireEvent.click(screen.getByRole('button', { name: 'Decline' })); continue; }
    fireEvent.click(screen.getByRole('button', { name: 'Oops, wrong' }));
    miss++;
  }
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

it('plays a scored round with the server seed and her memory, then claims the win once', async () => {
  serveQuestions({ labels: false });
  const requests = serveApi({
    '/user/illucia/stats': () => [200, { games: 0, ladder: RESET, spent: { total: 0, words: [] } }],
    '/user/illucia/start': body => [200, ticketFor(body)],
    '/user/illucia/claim': () => [200, { score: 180, awarded: { stump: 80, ladder: 0 }, ladder: { rung: 2, next: 'master', minLength: 6 } }],
  });
  const view = mount(); await start('crane', 'Scholar');
  expect(requests.find(([url]) => url === '/user/illucia/start')[1]).toEqual({ word: 'crane', tier: 'scholar' });
  expect(view.container.querySelector('.duel-stakes').textContent).toBe('A win is worth 80 points.');
  expect(screen.getByLabelText('Points: 80 pts')).toBeTruthy();
  await playToHerLoss(await realDecision());
  // Every decision used the server's seed and her validated memory of this player.
  expect(analyzeDecision.mock.calls.every(call => call[2].seed === 4242)).toBe(true);
  expect(analyzeDecision.mock.calls[0][1].brain).toMatchObject({ personalitySeed: 7, games: 3 });
  expect(screen.getByRole('heading', { name: 'You win' })).toBeTruthy();
  const claims = requests.filter(([url]) => url === '/user/illucia/claim');
  expect(claims).toEqual([['/user/illucia/claim', { roundId: 'round-crane-scholar', guesses: ['z', 'q', 'j', 'x', 'v', 'k'], answeredQuestions: 0 }]]);
  expect(screen.getByText('+80 points. Your total is 180.')).toBeTruthy();
  expect(auth.updateScore).toHaveBeenCalledWith('test-player', 180);
  expect(screen.getByText('Ladder: next, Master with a word of 6+ letters.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Climb to Master (6+ letters)' })).toBeTruthy();
  // The word has paid: a rematch with it is practice.
  expect(screen.getByRole('button', { name: 'Rematch vs Master (practice, 0 points)' })).toBeTruthy();
  await think();
  expect(requests.filter(([url]) => url === '/user/illucia/claim')).toHaveLength(1);
  // Climbing: the form offers the ladder's next rung.
  fireEvent.click(screen.getByRole('button', { name: 'Climb to Master (6+ letters)' }));
  expect(screen.getByRole('radio', { name: /Master/ }).checked).toBe(true);
  expect(screen.getByText('Ladder: next, Master with a word of 6+ letters. +100 at the top.')).toBeTruthy();
});

it('previews the multiplier for a checked answer and claims only answers that were right', async () => {
  serveQuestions();
  const requests = serveApi({
    '/user/illucia/start': body => [200, ticketFor(body)],
    '/user/illucia/claim': body => [200, { score: 900, awarded: { stump: illuciaStumpPoints('master', 5, body.answeredQuestions), ladder: 0 }, ladder: RESET }],
  });
  mount(); await start('crane', 'Master');
  await forceMisses(await realDecision());
  expect(screen.getByText('Answer correctly and still win: 100 → 150 points. Declining tells her nothing.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Yes, it can' }));
  expect(screen.getByLabelText('Points: 150 pts')).toBeTruthy();
  await playToHerLoss(await realDecision(), ['j', 'x', 'v', 'k']);
  expect(requests.find(([url]) => url === '/user/illucia/claim')[1].answeredQuestions).toBe(1);
  expect(screen.getByText('+150 points. Your total is 900.')).toBeTruthy();
});

it('a corrected answer earns no multiplier', async () => {
  serveQuestions();
  const requests = serveApi({
    '/user/illucia/start': body => [200, ticketFor(body)],
    '/user/illucia/claim': () => [200, { score: 100, awarded: { stump: 100, ladder: 0 }, ladder: RESET }],
  });
  mount(); await start('crane', 'Master');
  await forceMisses(await realDecision());
  fireEvent.click(screen.getByRole('button', { name: "No, it can't" }));
  expect(screen.getByLabelText('Points: 100 pts')).toBeTruthy();
  await playToHerLoss(await realDecision(), ['j', 'x', 'v', 'k']);
  expect(requests.find(([url]) => url === '/user/illucia/claim')[1].answeredQuestions).toBe(0);
});

it('waits out the claim floor silently, then saves', async () => {
  serveQuestions({ labels: false });
  let attempts = 0;
  const requests = serveApi({
    '/user/illucia/start': body => [200, ticketFor(body)],
    '/user/illucia/claim': () => (++attempts === 1
      ? [409, { message: 'The round is not ready to be claimed.', code: 'ROUND_TOO_EARLY', retryAfterMs: 3000 }]
      : [200, { score: 100, awarded: { stump: 100, ladder: 0 }, ladder: { rung: 0, next: 'apprentice', minLength: 4 } }]),
  });
  mount(); await start('crane', 'Master');
  await playToHerLoss(await realDecision());
  expect(screen.getByText('Saving…')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(requests.filter(([url]) => url === '/user/illucia/claim')).toHaveLength(2);
  expect(screen.getByText('+100 points. Your total is 100.')).toBeTruthy();
});

it('tells the player a used word pays nothing, before and after starting', async () => {
  serveQuestions({ labels: false });
  serveApi({
    '/user/illucia/stats': () => [200, { ladder: RESET, spent: { total: 1, words: ['crane'] } }],
    '/user/illucia/start': body => [200, ticketFor(body, { points: { eligible: false, stump: 0, reason: 'ALREADY_WON' } })],
    '/user/illucia/claim': () => [200, { score: 300, awarded: { stump: 0, ladder: 0 }, reason: 'ALREADY_WON', ladder: RESET }],
  });
  const view = mount();
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  fireEvent.click(screen.getByRole('radio', { name: /Master/ }));
  fireEvent.change(screen.getByLabelText('Your secret word'), { target: { value: 'crane' } });
  await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Start the duel' }).closest('form')); });
  expect(screen.getByText(ILLUCIA_ALREADY_WON_MESSAGE)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Start anyway' })).toBeTruthy();
  expect(fetch.mock.calls.some(([url]) => url === '/user/illucia/start')).toBe(false);
  await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Start anyway' }).closest('form')); });
  expect(bubbles(view.container, 'illucia')).toContain(ILLUCIA_ALREADY_WON_MESSAGE);
  expect(screen.getByLabelText('Points: No points')).toBeTruthy();
  await playToHerLoss(await realDecision());
  expect(view.container.querySelector('.duel-award').textContent).toBe(ILLUCIA_ALREADY_WON_MESSAGE);
});

it('offers the next rung, warns before a word that would reset the ladder, and asks twice before leaving a scored round', async () => {
  serveQuestions({ labels: false });
  const requests = serveApi({
    '/user/illucia/stats': () => [200, { ladder: { rung: 1, next: 'scholar', minLength: 6 }, spent: { total: 0, words: [] } }],
    '/user/illucia/start': body => [200, ticketFor(body, { ladder: { rung: 1, next: 'scholar', minLength: 6 } })],
  });
  mount();
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(screen.getByRole('radio', { name: /Scholar/ }).checked).toBe(true);
  fireEvent.change(screen.getByLabelText('Your secret word'), { target: { value: 'crane' } });
  await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Start the duel' }).closest('form')); });
  expect(screen.getByText('This resets your ladder (next rung: Scholar with 6+ letters).')).toBeTruthy();
  await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Start anyway' }).closest('form')); });
  expect(requests.filter(([url]) => url === '/user/illucia/start')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'New word' }));
  expect(screen.getByRole('button', { name: 'Leave? Counts as a loss' })).toBeTruthy();
  expect(screen.queryByLabelText('Your secret word')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Leave? Counts as a loss' }));
  // The abandoned round resets the ladder, and the next start names it as the round being left.
  expect(screen.getByText('Ladder: beat Apprentice, then Scholar, then Master in a row, each word longer, for +100.')).toBeTruthy();
  await start('crane', 'Master');
  expect(requests.filter(([url]) => url === '/user/illucia/start').at(-1)[1])
    .toEqual({ word: 'crane', tier: 'master', previousRoundId: 'round-crane-scholar' });
});

it('signs out on an expired session at the start, and plays unscored when the server fails', async () => {
  serveQuestions({ labels: false });
  serveApi({ '/user/illucia/start': () => [401, { message: 'Sign in again.' }] });
  mount(); await start('crane', 'Master');
  expect(auth.expireSession).toHaveBeenCalledWith('test-player');
  expect(analyzeDecision).not.toHaveBeenCalled();
  cleanup();
  serveApi({ '/user/illucia/start': () => [500, { message: 'Service unavailable.' }] });
  const view = mount(); await start('crane', 'Master');
  expect(view.container.querySelector('.duel-stakes').textContent).toBe('This duel is not scored: the scorekeeper could not be reached.');
  expect(screen.getByLabelText('Points: Not scored')).toBeTruthy();
});

// Her record and her memory (v2 E4).
const STATS = { games: 5, wins: 2, lostOrAbandoned: 3,
  tiers: { apprentice: { games: 1, wins: 1, lostOrAbandoned: 0 }, scholar: { games: 0, wins: 0, lostOrAbandoned: 0 }, master: { games: 4, wins: 1, lostOrAbandoned: 3 } },
  learned: { total: 2, recent: ['jazz', 'crane'] }, history: { lengths: { 4: 3, 5: 2 }, letters: { ...ZERO_LETTERS, a: 5, z: 3, e: 2, c: 1 } },
  ladder: RESET, spent: { total: 1, words: ['jazz'] } };

it('shows the player their record against her, from the server', async () => {
  let fail = true;
  serveApi({ '/user/illucia/stats': (_, requests) => (requests.length > 1 && fail ? [500, { message: 'Service unavailable.' }] : [200, STATS]) });
  mount();
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  // The first opening fails: an error with a retry, then the record.
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Your record vs Illucia' })); });
  expect(screen.getByText(/Your record could not load\./)).toBeTruthy();
  fail = false;
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
  const panel = screen.getByRole('region', { name: 'Your record vs Illucia' });
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Your record vs Illucia' }));
  expect(panel.querySelector('.duel-stats-total').textContent).toBe('5 duels · you won 2 · she won or you left 3');
  expect([...panel.querySelectorAll('tbody tr')].map(row => row.textContent)).toEqual(['Apprentice11', 'Scholar00', 'Master41']);
  expect(screen.getByText('JAZZ · CRANE')).toBeTruthy();
  expect(screen.getByText('Lengths: 4 letters (3) · 5 letters (2)')).toBeTruthy();
  expect(screen.getByText('Letters: A · Z · E · C')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('region', { name: 'Your record vs Illucia' })).toBeNull();
  expect(screen.getByLabelText('Your secret word')).toBeTruthy();
});

it('says when there is no record yet', async () => {
  serveApi({ '/user/illucia/stats': () => [200, { ...STATS, games: 0, wins: 0, lostOrAbandoned: 0 }] });
  mount();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Your record vs Illucia' })); });
  expect(screen.getByText('No duels yet. Set her a word.')).toBeTruthy();
});

it('remembers a word that beat her: AGAIN?? when it beats her again, and says she learned it when she solves it', async () => {
  serveQuestions({ labels: false });
  const learned = body => ticketFor(body, { memory: { brain: { personalitySeed: 7, games: 1, letters: { ...ZERO_LETTERS, c: 1, r: 1, a: 1, n: 1, e: 1 }, learned: [body.word] },
    voice: { plays: 1, beatenBefore: true, everyone: 1 } } });
  serveApi({ '/user/illucia/start': body => [200, learned(body)],
    '/user/illucia/claim': () => [200, { score: 100, awarded: { stump: 0, ladder: 0 }, reason: 'ALREADY_WON', ladder: RESET }] });
  let view = mount(); await start('crane', 'Master');
  await playToHerLoss(await realDecision());
  expect(bubbles(view.container, 'illucia')).toContain('CRANE… AGAIN?? I learned that word from you, and it still beat me.');
  cleanup();

  fetch.mockResolvedValue({ ok: true, text: async () => 'eerie 35\n' });
  serveApi({ '/user/illucia/start': body => [200, learned(body)] });
  view = mount(); await start('eerie', 'Master');
  while (!screen.queryByRole('heading', { name: 'Illucia wins' })) {
    const [tile] = hiddenTiles();
    if (tile) fireEvent.click(tile); else await think();
  }
  expect(bubbles(view.container, 'illucia').at(-1)).toBe('EERIE. I learned that one from you.');
});

it('has nothing to remember about a new word', async () => {
  serveApi({ '/user/illucia/start': body => [200, ticketFor(body)] });
  const view = mount(); await start('eerie', 'Master');
  while (!screen.queryByRole('heading', { name: 'Illucia wins' })) {
    const [tile] = hiddenTiles();
    if (tile) fireEvent.click(tile); else await think();
  }
  expect(bubbles(view.container, 'illucia').at(-1)).toMatch(/EERIE/);
  expect(bubbles(view.container, 'illucia').join(' ')).not.toMatch(/learned|again|tried/i);
});

// Experimental AI mode (v2 E5), against a mocked /user/illucia/ask: no real model is called.
const experimentalTicket = body => ticketFor(body, { experimental: true, points: { eligible: false, stump: 0, reason: 'EXPERIMENTAL' } });
async function startExperimental(word = 'crane') {
  fireEvent.click(screen.getByRole('checkbox', { name: 'Experimental AI mode' }));
  await start(word, 'Master');
}

it('keeps experimental mode off by default and warns when it is switched on', async () => {
  serveQuestions();
  const requests = serveApi({ '/user/illucia/start': body => [200, ticketFor(body)] });
  mount();
  const toggle = screen.getByRole('checkbox', { name: 'Experimental AI mode' });
  expect(toggle.checked).toBe(false);
  expect(screen.queryByText(/uses an AI model/)).toBeNull();
  fireEvent.click(toggle);
  expect(screen.getByText('Experimental: Illucia uses an AI model and can make mistakes. No points, and it resets your ladder.')).toBeTruthy();
  fireEvent.click(toggle);
  // Normal mode never calls the AI route, even when a question is due (she asks WordNet's instead).
  await start('crane', 'Master');
  await forceMisses(await realDecision());
  expect(requests.find(([url]) => url === '/user/illucia/start')[1]).toEqual({ word: 'crane', tier: 'master' });
  expect(screen.getByText(/Can your word mean a bird\?$/)).toBeTruthy();
  expect(requests.some(([url]) => url === '/user/illucia/ask')).toBe(false);
});

it('asks her AI helper instead of WordNet, leans on the answer without ruling words out, and claims nothing', async () => {
  serveQuestions();
  const requests = serveApi({
    '/user/illucia/start': body => [200, experimentalTicket(body)],
    '/user/illucia/ask': body => [200, { ok: true, question: 'Can your word mean something that flies?',
      yes: body.candidates.filter(word => BIRDS.has(word)), no: body.candidates.filter(word => !BIRDS.has(word)), questionsLeft: 1 }],
  });
  const view = mount(); await startExperimental();
  expect(requests.find(([url]) => url === '/user/illucia/start')[1]).toEqual({ word: 'crane', tier: 'master', experimental: true });
  expect(view.container.querySelector('.duel-stakes').textContent).toBe('Experimental mode: I may ask my AI helper for questions. This duel earns no points.');
  expect(screen.getByLabelText('Points: No points')).toBeTruthy();
  await forceMisses(await realDecision());
  const ask = requests.filter(([url]) => url === '/user/illucia/ask');
  expect(ask).toEqual([['/user/illucia/ask', { roundId: 'round-crane-master', candidates: QUESTION_WORDS }]]);
  expect(bubbles(view.container, 'illucia').at(-1)).toMatch(/Can your word mean something that flies\?$/);
  expect(bubbles(view.container, 'illucia').join(' ')).not.toMatch(/a bird\?/);
  expect(view.container.querySelectorAll('.duel-bubble small')[2].textContent).toMatch(/^Written by an AI model/);
  expect(screen.getByText(/An AI question earns nothing and cannot be checked/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Yes, it can' }));
  const real = await realDecision();
  analyzeDecision.mockImplementationOnce((...args) => ({ ...real(...args), letter: 'j' }));
  await think();
  // Every word is still possible; the birds now weigh three times as much.
  const knowledge = analyzeDecision.mock.calls.at(-1)[1];
  expect(knowledge.words).toEqual(QUESTION_WORDS);
  expect(knowledge.weights.get('heron')).toBe(30);
  expect(knowledge.weights.get('table')).toBe(10);
  fireEvent.click(screen.getByRole('button', { name: 'Oops, wrong' }));
  // Her second AI question (one left) is declined inside playToHerLoss.
  await playToHerLoss(real, ['x', 'v', 'k']);
  expect(requests.filter(([url]) => url === '/user/illucia/ask')).toHaveLength(2);
  expect(screen.getByText('Experimental duels earn no points.')).toBeTruthy();
  expect(requests.some(([url]) => url === '/user/illucia/claim')).toBe(false);
});

it('owns a failed AI question and makes her normal move, once per letter', async () => {
  serveQuestions();
  const requests = serveApi({
    '/user/illucia/start': body => [200, experimentalTicket(body)],
    '/user/illucia/ask': () => [200, { ok: false, reason: 'budget', questionsLeft: 2 }],
  });
  const view = mount(); await startExperimental();
  await forceMisses(await realDecision());
  expect(bubbles(view.container, 'illucia').at(-1)).toBe("My AI helper has used up today's allowance for the whole site. It is back after midnight UTC; until then, my own method.");
  const calls = analyzeDecision.mock.calls.length;
  await think();
  expect(analyzeDecision.mock.calls.length).toBe(calls + 1);
  expect(requests.filter(([url]) => url === '/user/illucia/ask')).toHaveLength(1);
});

it('treats a network failure or a sort that is not a partition as a failed question', async () => {
  serveQuestions();
  serveApi({
    '/user/illucia/start': body => [200, experimentalTicket(body)],
    '/user/illucia/ask': body => [200, { ok: true, question: 'Can your word mean a bird?', yes: ['crane', 'zebra'], no: body.candidates.slice(2), questionsLeft: 1 }],
  });
  const view = mount(); await startExperimental();
  await forceMisses(await realDecision());
  expect(bubbles(view.container, 'illucia').at(-1)).toBe('My AI helper did not come up with a usable question. My mistake for asking; back to my own method.');
  expect(screen.queryByRole('button', { name: 'Yes, it can' })).toBeNull();
});

// Characterization of the round lifecycle before it moves into shared modules (Observatory
// slice 1). Written against the unmodified page; the extraction must keep every one green.
async function playToHerWin() {
  while (!screen.queryByRole('heading', { name: 'Illucia wins' })) {
    const [tile] = hiddenTiles();
    if (tile) fireEvent.click(tile); else await think();
  }
}

it('names the ladder step a win would make: start, climb or top', async () => {
  fetch.mockImplementation(async url => ({ ok: true, text: async () => (url.endsWith('/6.txt') ? 'banana 35\n' : 'eerie 35\n') }));
  const stakes = async (word, tier, ladder) => {
    serveApi({ '/user/illucia/start': body => [200, ticketFor(body, { ladder })] });
    const view = mount(); await start(word, tier);
    const text = view.container.querySelector('.duel-stakes').textContent;
    cleanup();
    return text;
  };
  expect(await stakes('banana', 'Apprentice', RESET)).toBe('A win is worth 90 points. A win starts your ladder.');
  expect(await stakes('eerie', 'Master', { rung: 1, next: 'master', minLength: 5 })).toBe('A win is worth 100 points. This is rung 2 of 3 on your ladder.');
  expect(await stakes('banana', 'Master', { rung: 2, next: 'master', minLength: 6 })).toBe('A win is worth 150 points. Win, and your ladder is complete: +100.');
  // Positive control for "no step": a word shorter than the rung needs.
  expect(await stakes('eerie', 'Master', { rung: 2, next: 'master', minLength: 6 })).toBe('A win is worth 100 points.');
});

it('warns before an out-of-tier word and says the duel earns no points', async () => {
  fetch.mockResolvedValue({ ok: true, text: async () => 'abcd 35\nwxyz 70\n' });
  const requests = serveApi({ '/user/illucia/start': body => [200, ticketFor(body, { points: { eligible: false, stump: 0, reason: 'OUTSIDE_TIER' } })] });
  const view = mount();
  fireEvent.click(screen.getByRole('radio', { name: /Apprentice/ }));
  fireEvent.change(screen.getByLabelText('Your secret word'), { target: { value: 'wxyz' } });
  await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Start the duel' }).closest('form')); });
  expect(screen.getByText('Apprentice does not know this word: you can still win, but it earns no points.')).toBeTruthy();
  expect(requests.some(([url]) => url === '/user/illucia/start')).toBe(false);
  await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Start anyway' }).closest('form')); });
  expect(view.container.querySelector('.duel-stakes').textContent).toBe('Apprentice does not know this word, so this duel earns no points.');
  expect(screen.getByLabelText('Points: No points')).toBeTruthy();
});

it('her win in a scored round claims nothing and resets the ladder', async () => {
  const ladder = { rung: 1, next: 'master', minLength: 5 };
  const requests = serveApi({
    '/user/illucia/stats': () => [200, { ladder, spent: { total: 0, words: [] } }],
    '/user/illucia/start': body => [200, ticketFor(body, { ladder })],
  });
  mount();
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  await start('eerie', 'Master');
  await playToHerWin();
  expect(screen.getByText('No points this time. Your ladder resets.')).toBeTruthy();
  expect(requests.some(([url]) => url === '/user/illucia/claim')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
  expect(screen.getByText('Ladder: beat Apprentice, then Scholar, then Master in a row, each word longer, for +100.')).toBeTruthy();
});

it('reports a failed claim: retry after a server error, none after a conflict, sign-out after 401', async () => {
  serveQuestions({ labels: false });
  const claim = async status => {
    let attempts = 0;
    const requests = serveApi({
      '/user/illucia/start': body => [200, ticketFor(body)],
      '/user/illucia/claim': () => (++attempts === 1 ? [status, { message: 'No.' }] : [200, { score: 100, awarded: { stump: 100, ladder: 0 }, ladder: RESET }]),
    });
    mount(); await start('crane', 'Master');
    await playToHerLoss(await realDecision());
    return requests;
  };
  const requests = await claim(500);
  expect(screen.getByRole('alert').textContent).toBe('Could not confirm your points were saved. Retrying is safe.');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry saving' })); });
  expect(requests.filter(([url]) => url === '/user/illucia/claim')).toHaveLength(2);
  expect(screen.getByText('+100 points. Your total is 100.')).toBeTruthy();
  cleanup();

  await claim(409);
  expect(screen.getByRole('alert').textContent).toBe('This round can no longer earn points.');
  expect(screen.queryByRole('button', { name: 'Retry saving' })).toBeNull();
  cleanup();

  await claim(401);
  expect(auth.expireSession).toHaveBeenCalledWith('test-player');
  expect(screen.getByRole('alert').textContent).toBe('Your session expired, so these points could not be saved.');
});

it('a rematch keeps the word and the mode at the next tier', async () => {
  fetch.mockResolvedValue({ ok: true, text: async () => 'crane 35\n' });
  const requests = serveApi({
    '/user/illucia/stats': () => [200, { ladder: { rung: 1, next: 'scholar', minLength: 5 }, spent: { total: 0, words: [] } }],
    '/user/illucia/start': body => [200, body.experimental ? experimentalTicket(body) : ticketFor(body)],
    '/user/illucia/claim': () => [200, { score: 100, awarded: { stump: 80, ladder: 0 }, ladder: { rung: 2, next: 'master', minLength: 6 } }],
  });
  mount();
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  await start('crane', 'Scholar');
  await playToHerLoss(await realDecision());
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Rematch vs Master/ })); });
  // The claimed round is closed, so the rematch names no round to leave.
  expect(requests.filter(([url]) => url === '/user/illucia/start').at(-1)[1]).toEqual({ word: 'crane', tier: 'master' });
  cleanup();

  // Experimental: the rematch stays experimental, and the round broke the ladder.
  mount();
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(screen.getByText('Ladder: next, Scholar with a word of 5+ letters. +100 at the top.')).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Experimental AI mode' }));
  await start('crane', 'Scholar');
  await playToHerLoss(await realDecision());
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Rematch vs Master' })); });
  // An experimental win is never claimed, so its round is still open and the rematch leaves it.
  expect(requests.filter(([url]) => url === '/user/illucia/start').at(-1)[1])
    .toEqual({ word: 'crane', tier: 'master', experimental: true, previousRoundId: 'round-crane-scholar' });
  cleanup();

  // The experimental round alone breaks the ladder: no round was left, and nothing was claimed.
  mount();
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(screen.getByText('Ladder: next, Scholar with a word of 5+ letters. +100 at the top.')).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Experimental AI mode' }));
  await start('crane', 'Scholar');
  await playToHerLoss(await realDecision());
  fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
  expect(screen.getByText('Ladder: beat Apprentice, then Scholar, then Master in a row, each word longer, for +100.')).toBeTruthy();
});
