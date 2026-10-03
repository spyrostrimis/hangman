import React, { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import IlluciaObservatory from './IlluciaObservatory';
import { analyzeDecision } from '../lib/illucia/strategy.js';
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

const mount = () => render(<StrictMode><MemoryRouter><IlluciaObservatory /></MemoryRouter></StrictMode>);
async function start(word = 'EERIE', tier = 'Master') {
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(tier) }));
  fireEvent.change(screen.getByLabelText('Insert your secret word'), { target: { value: word } });
  await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Start the duel' }).closest('form')); });
  // An out-of-tier word asks first ("Start anyway"); these tests start regardless.
  const anyway = screen.queryByRole('button', { name: 'Start anyway' });
  if (anyway) await act(async () => { fireEvent.submit(anyway.closest('form')); });
}
// The static word files only (the server's /user/* requests are counted separately).
const staticCalls = () => fetch.mock.calls.filter(([url]) => !url.startsWith('/user/'));
// Longer than any turn delay, so exactly one guess happens per tick.
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(2300); });
const nextGuess = view => view.container.querySelector('.obs-bar.next .obs-bar-letter')?.textContent;
const tape = view => [...view.container.querySelectorAll('.obs-tape li:not(.empty)')].map(item => item.textContent);

it('sends only the length, keeps the secret off screen and out of the solver, and plays the highlighted letter', async () => {
  const view = mount();
  const input = screen.getByLabelText('Insert your secret word');
  expect(input.type).toBe('text');
  expect(view.container.querySelector('input[type="password"]')).toBeNull();
  await start();
  // Her words and her question labels for this length: never the secret, only the length.
  expect(staticCalls().map(call => call[0]).sort())
    .toEqual(['/illucia/labels/5.txt', '/illucia/labels/categories.json', '/illucia/words/5.txt']);
  for (const [, options] of staticCalls()) expect(Object.keys(options)).toEqual(['signal']);
  const state = analyzeDecision.mock.calls[0][0];
  expect(state.pattern).toEqual([null, null, null, null, null]);
  expect(state).not.toHaveProperty('answer');
  expect(JSON.stringify(state)).not.toContain('eerie');

  const highlighted = nextGuess(view);
  expect(highlighted).toBe('e');
  await tick();
  expect(tape(view)).toEqual(['e']);
  expect(screen.getByRole('status').textContent).toContain('E, hit, 3 positions');
  const second = nextGuess(view);
  await tick();
  expect(tape(view)).toEqual(['e', second]);
  await tick();
  expect(screen.getByRole('heading', { name: 'Illucia wins' })).toBeTruthy();
  expect(screen.getByText('EERIE')).toBeTruthy();
  expect(screen.getByText('Final suspects: eerie.')).toBeTruthy();
  const calls = analyzeDecision.mock.calls.length;
  await tick();
  expect(analyzeDecision.mock.calls.length).toBe(calls);
  expect(tape(view)).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
  expect(screen.getByLabelText('Insert your secret word').value).toBe('');
});

it('keeps the secret off screen while she still has more than ten candidates', async () => {
  const words = ['abbey', 'badge', 'cable', 'dance', 'eerie', 'fable', 'gauge', 'hedge', 'ledge', 'madam', 'nudge', 'ridge'];
  fetch.mockResolvedValue({ ok: true, text: async () => words.map(word => `${word} 35
`).join('') });
  const view = mount(); await start('eerie');
  expect(view.container.querySelector('.obs-hud b').textContent).toBe('12');
  expect(view.container.textContent.toLowerCase()).not.toContain('eerie');
  expect(view.container.querySelector('.obs-shortlist')).toBeNull();
  // Positive control: the same page shows the word once the round is over.
  fireEvent.click(screen.getByRole('button', { name: 'Speed 1×' }));
  for (let turn = 0; turn < 26 && !screen.queryByRole('heading', { name: /wins|You win/ }); turn++) await tick();
  expect(view.container.textContent).toContain('EERIE');
});

it('falls back inside a low tier, ends after six misses and offers a rematch at the next tier', async () => {
  // Her first guess (A or B) misses WXYZ and rules out all three words she knows; her fallback
  // then picks among C-H, so every letter misses whichever seed settles the ties.
  fetch.mockResolvedValue({ ok: true, text: async () => 'abcd 35\nabef 35\nabgh 35\nwxyz 70\n' });
  const view = mount(); await start('wxyz', 'Apprentice');
  expect(analyzeDecision.mock.calls[0][1].words).toEqual(['abcd', 'abef', 'abgh']);
  expect(analyzeDecision.mock.calls[0][2]).toEqual({ seed: 1234 });
  await tick();
  expect(view.container.querySelector('.obs-reasoning').textContent).toContain('falls back on habit');
  for (let index = 1; index < 6; index++) await tick();
  expect(screen.getByRole('heading', { name: 'You win!' })).toBeTruthy();
  expect(screen.getByRole('img', { name: '0 of 6 misses left' })).toBeTruthy();
  // The server could not be reached in this fixture, so the duel was not scored.
  expect(screen.getByText('This duel was not scored.')).toBeTruthy();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Rematch vs Scholar' })); });
  expect(screen.getByText('Scholar')).toBeTruthy();
  expect(tape(view)).toEqual([]);
  // Static files for this length only (the warning's second press loads them again).
  expect(new Set(staticCalls().map(call => call[0])))
    .toEqual(new Set(['/illucia/words/4.txt', '/illucia/labels/4.txt', '/illucia/labels/categories.json']));
});

it('pause stops her turns and resume continues them', async () => {
  const view = mount(); await start();
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  await tick(); await tick();
  expect(tape(view)).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
  await tick();
  expect(tape(view)).toEqual(['e']);
});

it('rejects invalid and unlisted words without starting', async () => {
  mount(); await start('two words');
  expect(screen.getByRole('alert').textContent).toContain('A–Z only');
  expect(staticCalls()).toHaveLength(0);
  await start('zzzzz');
  expect(screen.getByRole('alert').textContent).toContain('cannot accept');
  expect(screen.getByLabelText('Insert your secret word')).toBeTruthy();
});

it('asks for 4-15 letters and never fetches a 3-letter word file', async () => {
  mount(); await start('cat');
  expect(screen.getByRole('alert').textContent).toBe('Choose 4–15 letters, A–Z only, with no spaces or punctuation.');
  expect(staticCalls()).toHaveLength(0);
  // Positive control: four letters pass the shape check and load that length.
  fetch.mockResolvedValue({ ok: true, text: async () => 'cats 35\n' });
  await start('cats');
  expect(staticCalls()[0][0]).toBe('/illucia/words/4.txt');
  expect(screen.queryByRole('alert')).toBeNull();
});

it('shows a recoverable error when the solver fails instead of inventing an outcome', async () => {
  const view = mount(); await start();
  analyzeDecision.mockImplementation(() => { throw new Error('Master invariant: zero candidates.'); });
  await tick();
  expect(screen.getByRole('alert').textContent).toContain('could not continue');
  expect(screen.queryByRole('heading', { name: 'You win!' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Illucia wins' })).toBeNull();
  expect(tape(view)).toEqual(['e']);
  await tick();
  expect(tape(view)).toEqual(['e']);
});

// Her letter scores (Observatory slice 2): the bars and the reasoning come from her decision record.
const bar = (view, letter) => [...view.container.querySelectorAll('.obs-bar')].find(node => node.querySelector('.obs-bar-letter').textContent === letter);
const barHeight = (view, letter) => Number(bar(view, letter).querySelector('.obs-bar-fill')?.style.getPropertyValue('--h') ?? 0);

it('draws her weighted score, not a plain word count, and explains the choice from her record', async () => {
  // A is in one common word; B is in two rare ones. Counting words, B would be taller; weighting, A is.
  fetch.mockResolvedValue({ ok: true, text: async () => 'aaaa 35\nbbbb 70\nbbbc 70\n' });
  const view = mount(); await start('aaaa', 'Master');
  expect(nextGuess(view)).toBe('a');
  expect(barHeight(view, 'a')).toBe(1);
  expect(barHeight(view, 'b')).toBeLessThan(0.5);
  expect(barHeight(view, 'b')).toBeGreaterThan(0); // positive control: B is drawn
  const decision = analyzeDecision.mock.results.at(-1).value;
  expect(view.container.querySelector('.obs-reasoning').textContent)
    .toBe(`Counting common words more, A covers ${Math.round(decision.share / 100)}% of the 3 words she still has in mind. ` +
      'It comes out on top, helped by her early lean towards vowels. So A is next.');
  // Her early vowel lean is drawn as the violet top of A's bar.
  expect(bar(view, 'a').querySelector('.obs-bar-lean')).toBeTruthy();
  expect(bar(view, 'b').querySelector('.obs-bar-lean')).toBeNull();
});

it('never calls a hunch her top pick', async () => {
  fetch.mockResolvedValue({ ok: true, text: async () => 'aaaa 35\nbbbb 70\nbbbc 70\n' });
  const real = (await vi.importActual('../lib/illucia/strategy.js')).analyzeDecision;
  analyzeDecision.mockImplementation((...args) => ({ ...real(...args), choseBest: false, best: ['b'] }));
  const view = mount(); await start('aaaa', 'Master');
  const text = view.container.querySelector('.obs-reasoning').textContent;
  expect(text).toContain('B scores a little higher, but A is on her shortlist and she has a feeling about it.');
  expect(text).not.toContain('comes out on top');
});

// 20 four-letter strings, no vowels: B is in 12 (60%), C in 11 (55%), D in 9 (45%). Apprentice's
// shortlist reaches 10 points below her best, so B and C are on it and D is not.
const FILLER = 'fghjklmnprstvw';
const SHARES = Array.from({ length: 20 }, (_, i) => {
  const core = (i < 12 ? 'b' : '') + (i >= 9 ? 'c' : '') + (i < 9 ? 'd' : '');
  return (core + FILLER[i % 14] + FILLER[(i + 7) % 14] + FILLER[(i + 3) % 14]).slice(0, 4);
}).sort();

it('outlines her shortlist above a dashed cut-off while she explores, and only her best letter once careful', async () => {
  fetch.mockResolvedValue({ ok: true, text: async () => SHARES.map(word => `${word} 35\n`).join('') });
  const view = mount(); await start(SHARES[0], 'Apprentice');
  const decision = analyzeDecision.mock.results.at(-1).value;
  expect(decision.mode).toBe('exploring');
  expect(new Set(SHARES).size).toBe(20); // fixture check: 20 distinct words, B and C on her shortlist
  expect(decision.shortlist.map(entry => entry.letter).sort()).toEqual(['b', 'c']);
  const listed = () => [...view.container.querySelectorAll('.obs-bar.listed .obs-bar-letter')].map(node => node.textContent).sort();
  expect(listed()).toEqual(['b', 'c']);
  expect(view.container.querySelectorAll('.obs-bar-cut').length).toBe(26);
  expect(view.container.textContent).toContain('above the dashed line: her shortlist');
  expect(view.container.querySelector('.obs-reasoning').textContent).toMatch(/Her odds: [BC] \d+% · [BC] \d+%\./);
  cleanup();

  // Four forced misses (Q, X, Y, Z are in no word) leave her two: careful, strictly her best letter.
  const real = (await vi.importActual('../lib/illucia/strategy.js')).analyzeDecision;
  analyzeDecision.mockImplementation((state, knowledge, options) => {
    const decision = real(state, knowledge, options);
    const forced = 'qxyz'[state.guessedLetters.length];
    return forced ? { ...decision, letter: forced } : decision;
  });
  const careful = mount(); await start(SHARES[0], 'Apprentice');
  for (let turn = 0; turn < 4; turn++) await tick();
  expect(screen.getByRole('img', { name: '2 of 6 misses left' })).toBeTruthy();
  const record = analyzeDecision.mock.results.at(-1).value;
  expect(record.mode).toBe('careful');
  expect(careful.container.querySelectorAll('.obs-bar-cut').length).toBe(0);
  expect([...careful.container.querySelectorAll('.obs-bar.listed .obs-bar-letter')].map(node => node.textContent)).toEqual(['b']);
  expect(careful.container.querySelector('.obs-reasoning').textContent).toContain('No more hunches: it is her best letter.');
  expect(careful.container.textContent).not.toContain('above the dashed line');
});

it('calls the words she still considers "still possible", not her shortlist', async () => {
  fetch.mockResolvedValue({ ok: true, text: async () => 'eerie 35\nsense 35\nthree 35\n' });
  const view = mount(); await start('eerie');
  expect(view.container.querySelector('.obs-shortlist').textContent).toBe('Words still possible: eerie · sense · three');
});

it('says each level knows more words and plays more carefully, never that only her vocabulary changes', async () => {
  const view = mount();
  expect(view.container.textContent).toContain('Each level knows more words and plays a little more carefully.');
  expect(view.container.textContent).not.toContain('Only her vocabulary changes');
  await start();
  expect(newLocalSeed).toHaveBeenCalledTimes(1);
  expect(analyzeDecision.mock.calls.every(call => call[2]?.seed === 1234)).toBe(true);
});

// Scored rounds and her memory (Observatory slice 3). The API is mocked with the shapes the
// Worker sends; every other request falls through to the fixture's word file.
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
const CRANE = 'chair 35\ncrane 35\neagle 35\nheron 35\nplate 35\nrobin 35\nstone 35\ntable 35\n';
// Forces her letters (none in the fixture's words) so the player wins; she plays the rest herself.
async function forceLetters(letters) {
  const real = (await vi.importActual('../lib/illucia/strategy.js')).analyzeDecision;
  analyzeDecision.mockImplementation((state, knowledge, options) => {
    const decision = real(state, knowledge, options);
    const forced = letters[state.guessedLetters.length];
    return forced ? { ...decision, letter: forced } : decision;
  });
}
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const points = view => view.container.querySelector('.obs-points')?.textContent;

it('plays a scored round with the server seed and her memory, shows the stakes, and claims the win once', async () => {
  fetch.mockResolvedValue({ ok: true, text: async () => CRANE });
  const requests = serveApi({
    '/user/illucia/stats': () => [200, { games: 0, ladder: RESET, spent: { total: 0, words: [] } }],
    '/user/illucia/start': body => [200, ticketFor(body)],
    '/user/illucia/claim': () => [200, { score: 180, awarded: { stump: 80, ladder: 0 }, ladder: { rung: 2, next: 'master', minLength: 6 } }],
  });
  await forceLetters('zqjxvk');
  const view = mount(); await settle();
  expect(screen.getByText('Her guessing sees only the blanks. The server keeps your word to check the result.')).toBeTruthy();
  await start('crane', 'Scholar');
  expect(requests.find(([url]) => url === '/user/illucia/start')[1]).toEqual({ word: 'crane', tier: 'scholar' });
  expect(view.container.querySelector('.obs-stakes').textContent).toBe('A win is worth 80 points.');
  expect(points(view)).toBe('80 pts');
  for (let turn = 0; turn < 6; turn++) await tick();
  await settle();
  // Every decision used the server's seed and her validated memory of this player.
  expect(analyzeDecision.mock.calls.every(call => call[2].seed === 4242)).toBe(true);
  expect(analyzeDecision.mock.calls[0][1].brain).toMatchObject({ personalitySeed: 7, games: 3 });
  expect(screen.getByRole('heading', { name: 'You win!' })).toBeTruthy();
  const claims = requests.filter(([url]) => url === '/user/illucia/claim');
  expect(claims).toEqual([['/user/illucia/claim', { roundId: 'round-crane-scholar', guesses: [...'zqjxvk'], answeredQuestions: 0 }]]);
  expect(screen.getByText('+80 points. Your total is 180.')).toBeTruthy();
  expect(auth.updateScore).toHaveBeenCalledWith('test-player', 180);
  expect(screen.getByText('Ladder: next, Master with a word of 6+ letters.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Climb to Master (6+ letters)' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Rematch vs Master (practice, 0 points)' })).toBeTruthy();
  await tick();
  expect(requests.filter(([url]) => url === '/user/illucia/claim')).toHaveLength(1);
  // Climbing: the form offers the ladder's next rung, marked on its card.
  fireEvent.click(screen.getByRole('button', { name: 'Climb to Master (6+ letters)' }));
  expect(screen.getByRole('radio', { name: /Master/ }).checked).toBe(true);
  expect(view.container.querySelector('.obs-tiers label.selected .obs-rung').textContent).toBe('Next rung · 6+ letters');
  expect(screen.getByText('Ladder: next, Master with a word of 6+ letters. +100 at the top.')).toBeTruthy();
});

it('her win claims nothing and resets the ladder; a server failure plays unscored; 401 signs out', async () => {
  const ladder = { rung: 1, next: 'master', minLength: 5 };
  const requests = serveApi({
    '/user/illucia/stats': () => [200, { ladder, spent: { total: 0, words: [] } }],
    '/user/illucia/start': body => [200, ticketFor(body, { ladder })],
  });
  const view = mount(); await settle();
  // The ladder on the tier cards: Apprentice climbed, Master is the next rung.
  expect([...view.container.querySelectorAll('.obs-rung')].map(node => node.textContent)).toEqual(['Climbed', 'Next rung · 5+ letters']);
  await start('eerie', 'Master');
  expect(view.container.querySelector('.obs-stakes').textContent).toBe('A win is worth 100 points. This is rung 2 of 3 on your ladder.');
  for (let turn = 0; turn < 4 && !screen.queryByRole('heading', { name: 'Illucia wins' }); turn++) await tick();
  expect(screen.getByText('No points this time. Your ladder resets.')).toBeTruthy();
  expect(requests.some(([url]) => url === '/user/illucia/claim')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
  expect(screen.getByText('Ladder: beat Apprentice, then Scholar, then Master in a row, each word longer, for +100.')).toBeTruthy();
  cleanup();

  serveApi({ '/user/illucia/start': () => [500, { message: 'Service unavailable.' }] });
  const unscored = mount(); await start('eerie', 'Master');
  expect(unscored.container.querySelector('.obs-stakes').textContent).toBe('This duel is not scored: the scorekeeper could not be reached.');
  expect(points(unscored)).toBe('Not scored');
  expect(newLocalSeed).toHaveBeenCalled();
  cleanup();

  serveApi({ '/user/illucia/start': () => [401, { message: 'Sign in again.' }] });
  analyzeDecision.mockClear();
  mount(); await start('eerie', 'Master');
  expect(auth.expireSession).toHaveBeenCalledWith('test-player');
  expect(analyzeDecision).not.toHaveBeenCalled();
});

it('warns before a word that pays nothing or resets the ladder, and asks twice before leaving a scored round', async () => {
  fetch.mockResolvedValue({ ok: true, text: async () => CRANE });
  const requests = serveApi({
    '/user/illucia/stats': () => [200, { ladder: { rung: 1, next: 'scholar', minLength: 6 }, spent: { total: 1, words: ['crane'] } }],
    '/user/illucia/start': body => [200, ticketFor(body, { ladder: { rung: 1, next: 'scholar', minLength: 6 },
      points: { eligible: false, stump: 0, reason: 'ALREADY_WON' } })],
  });
  const view = mount(); await settle();
  expect(screen.getByRole('radio', { name: /Scholar/ }).checked).toBe(true);
  fireEvent.change(screen.getByLabelText('Insert your secret word'), { target: { value: 'crane' } });
  await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Start the duel' }).closest('form')); });
  expect(view.container.querySelector('.obs-warning').textContent)
    .toBe(`${ILLUCIA_ALREADY_WON_MESSAGE} This resets your ladder (next rung: Scholar with 6+ letters).`);
  expect(requests.some(([url]) => url === '/user/illucia/start')).toBe(false);
  await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Start anyway' }).closest('form')); });
  expect(view.container.querySelector('.obs-stakes').textContent).toBe(ILLUCIA_ALREADY_WON_MESSAGE);
  expect(points(view)).toBe('No points');
  fireEvent.click(screen.getByRole('button', { name: 'New word' }));
  expect(screen.getByRole('button', { name: 'Leave? Counts as a loss' })).toBeTruthy();
  expect(screen.queryByLabelText('Insert your secret word')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Leave? Counts as a loss' }));
  // The abandoned round resets the ladder, and the next start names it as the round being left.
  expect(screen.getByText('Ladder: beat Apprentice, then Scholar, then Master in a row, each word longer, for +100.')).toBeTruthy();
  await start('robin', 'Master');
  expect(requests.filter(([url]) => url === '/user/illucia/start').at(-1)[1])
    .toEqual({ word: 'robin', tier: 'master', previousRoundId: 'round-crane-scholar' });
});

it('shows words that beat her as their own stars, and remembers the word at the end', async () => {
  fetch.mockResolvedValue({ ok: true, text: async () => CRANE });
  const learned = body => ticketFor(body, { memory: {
    brain: { personalitySeed: 7, games: 2, letters: { ...ZERO_LETTERS, c: 1, r: 2, a: 1, n: 1, e: 2, o: 1, b: 1, i: 1 }, learned: ['crane', 'robin'] },
    voice: { plays: 1, beatenBefore: true, everyone: 1 } } });
  serveApi({ '/user/illucia/start': body => [200, learned(body)],
    '/user/illucia/claim': () => [200, { score: 100, awarded: { stump: 0, ladder: 0 }, reason: 'ALREADY_WON', ladder: RESET }] });
  await forceLetters('zqjxvk');
  const view = mount(); await start('crane', 'Master');
  expect(view.container.querySelectorAll('.obs-stars span.learned')).toHaveLength(2);
  expect(view.container.querySelectorAll('.obs-stars span:not(.learned)').length).toBeGreaterThan(0); // positive control
  for (let turn = 0; turn < 6; turn++) await tick();
  await settle();
  expect(view.container.querySelector('.obs-bubble').textContent).toMatch(/CRANE… AGAIN\?\? I learned that word from you, and it still beat me\.$/);
  expect(view.container.querySelector('.obs-award').textContent).toBe(ILLUCIA_ALREADY_WON_MESSAGE);
});

it('reports a failed claim and saves on retry', async () => {
  fetch.mockResolvedValue({ ok: true, text: async () => CRANE });
  let attempts = 0;
  const requests = serveApi({
    '/user/illucia/start': body => [200, ticketFor(body)],
    '/user/illucia/claim': () => (++attempts === 1 ? [500, { message: 'No.' }] : [200, { score: 100, awarded: { stump: 100, ladder: 0 }, ladder: RESET }]),
  });
  await forceLetters('zqjxvk');
  mount(); await start('crane', 'Master');
  for (let turn = 0; turn < 6; turn++) await tick();
  await settle();
  expect(screen.getByRole('alert').textContent).toBe('Could not confirm your points were saved. Retrying is safe.');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry saving' })); });
  expect(requests.filter(([url]) => url === '/user/illucia/claim')).toHaveLength(2);
  expect(screen.getByText('+100 points. Your total is 100.')).toBeTruthy();
});

it('counts the letters she got right in the singular too', async () => {
  fetch.mockResolvedValue({ ok: true, text: async () => CRANE });
  serveApi({ '/user/illucia/start': () => [500, { message: 'Service unavailable.' }] });
  await forceLetters('czqjxvk'); // one hit (C), then six misses
  mount(); await start('crane', 'Master');
  for (let turn = 0; turn < 7; turn++) await tick();
  expect(screen.getByText('You held out for six misses. She guessed 1 letter right.')).toBeTruthy();
});

// Her questions (Observatory slice 4). Four birds and four other words; she knows them all.
const QUESTION_WORDS = ['chair', 'crane', 'eagle', 'heron', 'plate', 'robin', 'stone', 'table'];
const BIRDS = new Set(['crane', 'eagle', 'heron', 'robin']);
const CATEGORIES = { categories: [
  { code: 'c', key: 'bird', kind: 'noun', question: 'Can your word mean a bird?', kindOf: { 'oewn-01505702-n': 'bird' } },
  { code: 'o', key: 'artifact', kind: 'noun', question: 'Can your word mean a man-made object?', lexfiles: ['noun.artifact'] },
] };
function serveQuestions({ unknown = null, labels = true } = {}) {
  const words = QUESTION_WORDS.map(word => `${word} 35\n`).join('');
  const lines = QUESTION_WORDS.filter(word => word !== unknown).map(word => `${word} ${BIRDS.has(word) ? 'c' : 'o'}\n`).join('');
  fetch.mockImplementation(async url => {
    if (url === '/illucia/words/5.txt') return { ok: true, text: async () => words };
    if (url === '/illucia/labels/5.txt') return labels ? { ok: true, text: async () => lines } : { ok: false };
    if (url === '/illucia/labels/categories.json') return { ok: true, json: async () => CATEGORIES };
    return { ok: false };
  });
}
const card = view => view.container.querySelector('.obs-question');
const sky = (view, kind) => view.container.querySelectorAll(`.obs-stars span.${kind}`).length;

it('asks after two letters and holds the duel, splits her sky, and pays the multiplier for a checked answer', async () => {
  serveQuestions();
  const requests = serveApi({
    '/user/illucia/start': body => [200, ticketFor(body)],
    '/user/illucia/claim': body => [200, { score: 900, awarded: { stump: illuciaStumpPoints('master', 5, body.answeredQuestions), ladder: 0 }, ladder: RESET }],
  });
  await forceLetters('zqjxvk');
  const view = mount(); await start('crane', 'Master');
  await tick(); await tick();
  expect(card(view)).toBeNull(); // positive control: no question before her third turn
  // Her thinking pause before a question says so, not a letter.
  expect(view.container.querySelector('.obs-reasoning').textContent).toBe('Instead of a letter, she is choosing a question to ask you.');
  await tick();
  expect(card(view).querySelector('h3').textContent).toBe('Can your word mean a bird?');
  expect(view.container.querySelector('.obs-bubble').textContent).toMatch(/Can your word mean a bird\?$/);
  expect(card(view).textContent).toContain('Answer correctly and still win: 100 → 150 points. Declining tells her nothing.');
  expect(card(view).textContent).toContain('Open English WordNet (CC BY 4.0)');
  expect([...card(view).querySelectorAll('button')].map(button => button.textContent)).toEqual(['Yes, it can', "No, it can't", 'Decline']);
  expect(document.activeElement).toBe(card(view).querySelector('h3'));
  // Her sky splits: four birds green, four other words blue.
  expect([sky(view, 'side-yes'), sky(view, 'side-no')]).toEqual([4, 4]);
  expect(view.container.querySelector('.obs-analyzer')).toBeNull();
  // The duel holds until the player chooses.
  await tick(); await tick();
  expect(tape(view)).toEqual(['z', 'q']);
  fireEvent.click(screen.getByRole('button', { name: 'Yes, it can' }));
  expect(card(view)).toBeNull();
  expect(points(view)).toBe('150 pts');
  // The words it ruled out fade from her sky; the split is gone.
  expect([sky(view, 'side-yes'), sky(view, 'side-no')]).toEqual([0, 0]);
  expect(sky(view, 'out')).toBe(4);
  await tick();
  expect(tape(view)).toEqual(['z', 'q', 'j']);
  expect(analyzeDecision.mock.calls.at(-1)[1].words).toEqual(['crane', 'eagle', 'heron', 'robin']);
  for (let turn = 0; turn < 3; turn++) await tick();
  await settle();
  expect(requests.find(([url]) => url === '/user/illucia/claim')[1].answeredQuestions).toBe(1);
  expect(screen.getByText('+150 points. Your total is 900.')).toBeTruthy();
});

it('corrects a wrong answer and pays no multiplier; a decline changes nothing', async () => {
  serveQuestions();
  const requests = serveApi({
    '/user/illucia/start': body => [200, ticketFor(body)],
    '/user/illucia/claim': () => [200, { score: 100, awarded: { stump: 100, ladder: 0 }, ladder: RESET }],
  });
  await forceLetters('zqjxvk');
  let view = mount(); await start('crane', 'Master');
  for (let turn = 0; turn < 3; turn++) await tick();
  fireEvent.click(screen.getByRole('button', { name: "No, it can't" }));
  expect(view.container.querySelector('.obs-bubble').textContent).toMatch(/^My archive says otherwise: your word can mean that\./);
  expect(points(view)).toBe('100 pts');
  for (let turn = 0; turn < 4; turn++) await tick();
  await settle();
  expect(requests.find(([url]) => url === '/user/illucia/claim')[1].answeredQuestions).toBe(0);
  cleanup();

  view = mount(); await start('crane', 'Master');
  for (let turn = 0; turn < 3; turn++) await tick();
  fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
  expect(view.container.querySelector('.obs-bubble').textContent).toMatch(/Back to letters\.$/);
  expect([sky(view, 'side-yes'), sky(view, 'side-no'), sky(view, 'out')]).toEqual([0, 0, 0]);
  // She learned nothing, and asks at most once per letter: a letter comes next, over all eight words.
  await tick();
  expect(tape(view)).toEqual(['z', 'q', 'j']);
  expect(analyzeDecision.mock.calls.at(-1)[1].words).toEqual(QUESTION_WORDS);
});

it('says no bonus is possible for a word her archive does not know, and asks nothing without labels', async () => {
  serveQuestions({ unknown: 'crane' });
  serveApi({ '/user/illucia/start': body => [200, ticketFor(body)] });
  await forceLetters('zqjxvk');
  let view = mount(); await start('crane', 'Master');
  for (let turn = 0; turn < 3; turn++) await tick();
  expect(card(view).textContent).toContain('My archive does not know your word, so your answer cannot be checked: no bonus possible for this word.');
  cleanup();

  serveQuestions({ labels: false });
  serveApi({ '/user/illucia/start': body => [200, ticketFor(body)] });
  view = mount(); await start('crane', 'Master');
  for (let turn = 0; turn < 3; turn++) await tick();
  expect(card(view)).toBeNull();
  expect(tape(view)).toEqual(['z', 'q', 'j']);
  expect(screen.getByText(/questions: Open English WordNet \(CC BY 4\.0\)/)).toBeTruthy();
});

// Your record (Observatory slice 5): the shared record, in the notebook in place of the form.
const STATS = { games: 5, wins: 2, lostOrAbandoned: 3,
  tiers: { apprentice: { games: 1, wins: 1, lostOrAbandoned: 0 }, scholar: { games: 0, wins: 0, lostOrAbandoned: 0 }, master: { games: 4, wins: 1, lostOrAbandoned: 3 } },
  learned: { total: 2, recent: ['jazz', 'crane'] }, history: { lengths: { 4: 3, 5: 2 }, letters: { ...ZERO_LETTERS, a: 5, z: 3, e: 2, c: 1 } },
  ladder: RESET, spent: { total: 1, words: ['jazz'] } };

it('shows the player their record in the notebook, with a retry, and closes back to the form', async () => {
  let fail = true;
  serveApi({ '/user/illucia/stats': (_, requests) => (requests.length > 1 && fail ? [500, { message: 'Service unavailable.' }] : [200, STATS]) });
  const view = mount(); await settle();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Your record vs Illucia' })); });
  expect(screen.getByText(/Your record could not load\./)).toBeTruthy();
  expect(screen.queryByLabelText('Insert your secret word')).toBeNull(); // the record replaces the form
  fail = false;
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
  const panel = screen.getByRole('region', { name: 'Your record vs Illucia' });
  expect(panel.closest('.obs-screen')).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Your record vs Illucia' }));
  expect(panel.querySelector('.obs-stats-total').textContent).toBe('5 duels · you won 2 · she won or you left 3');
  expect([...panel.querySelectorAll('tbody tr')].map(row => row.textContent)).toEqual(['Apprentice11', 'Scholar00', 'Master41']);
  expect(screen.getByText('JAZZ · CRANE')).toBeTruthy();
  expect(screen.getByText('Lengths: 4 letters (3) · 5 letters (2)')).toBeTruthy();
  expect(screen.getByText('Letters: A · Z · E · C')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('region', { name: 'Your record vs Illucia' })).toBeNull();
  expect(screen.getByLabelText('Insert your secret word')).toBeTruthy();
  expect(view.container.querySelector('.obs-pod')).toBeTruthy(); // Illucia stays on stage
});

it('opens the record from the end of a duel, and closes back to the form', async () => {
  serveApi({ '/user/illucia/stats': () => [200, { ...STATS, games: 0, wins: 0, lostOrAbandoned: 0 }] });
  mount(); await start();
  for (let turn = 0; turn < 4 && !screen.queryByRole('heading', { name: 'Illucia wins' }); turn++) await tick();
  expect(screen.queryByRole('button', { name: 'Your record' })).toBeTruthy();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Your record' })); });
  expect(screen.getByText('No duels yet. Set her a word.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.getByLabelText('Insert your secret word')).toBeTruthy();
});

// Experimental AI mode (Observatory slice 6), against a mocked /user/illucia/ask: no real model is called.
const experimentalTicket = body => ticketFor(body, { experimental: true, points: { eligible: false, stump: 0, reason: 'EXPERIMENTAL' } });

it('keeps experimental mode off by default, warns when it is on, and never asks the AI in normal mode', async () => {
  serveQuestions();
  const requests = serveApi({ '/user/illucia/start': body => [200, ticketFor(body)] });
  await forceLetters('zqjxvk');
  const view = mount();
  const toggle = screen.getByRole('checkbox', { name: 'Experimental AI mode' });
  expect(toggle.checked).toBe(false);
  expect(screen.queryByText(/uses an AI model/)).toBeNull();
  fireEvent.click(toggle);
  expect(screen.getByText('Experimental: Illucia uses an AI model and can make mistakes. No points, and it resets your ladder.')).toBeTruthy();
  fireEvent.click(toggle);
  await start('crane', 'Master');
  for (let turn = 0; turn < 3; turn++) await tick();
  expect(requests.find(([url]) => url === '/user/illucia/start')[1]).toEqual({ word: 'crane', tier: 'master' });
  expect(card(view).querySelector('h3').textContent).toBe('Can your word mean a bird?');
  expect(requests.some(([url]) => url === '/user/illucia/ask')).toBe(false);
});

it('asks her AI helper instead of WordNet, splits her sky by its sort, leans on the answer, and claims nothing', async () => {
  serveQuestions();
  const requests = serveApi({
    '/user/illucia/start': body => [200, experimentalTicket(body)],
    '/user/illucia/ask': body => [200, { ok: true, question: 'Can your word mean something that flies?',
      yes: body.candidates.filter(word => BIRDS.has(word)), no: body.candidates.filter(word => !BIRDS.has(word)), questionsLeft: 1 }],
  });
  await forceLetters('zqjxvk');
  const view = mount();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Experimental AI mode' }));
  await start('crane', 'Master');
  expect(requests.find(([url]) => url === '/user/illucia/start')[1]).toEqual({ word: 'crane', tier: 'master', experimental: true });
  expect(view.container.querySelector('.obs-stakes').textContent).toBe('Experimental mode: I may ask my AI helper for questions. This duel earns no points.');
  expect(points(view)).toBe('No points');
  await tick(); await tick(); await tick();
  await settle();
  expect(requests.filter(([url]) => url === '/user/illucia/ask')).toEqual([['/user/illucia/ask', { roundId: 'round-crane-master', candidates: QUESTION_WORDS }]]);
  expect(card(view).querySelector('h3').textContent).toBe('Can your word mean something that flies?');
  expect(view.container.querySelector('.obs-bubble').textContent).toMatch(/Can your word mean something that flies\?$/);
  expect(card(view).textContent).toMatch(/Written by an AI model/);
  expect(card(view).textContent).toContain('An AI question earns nothing and cannot be checked.');
  expect([sky(view, 'side-yes'), sky(view, 'side-no')]).toEqual([4, 4]);
  fireEvent.click(screen.getByRole('button', { name: 'Yes, it can' }));
  expect(view.container.querySelector('.obs-bubble').textContent).toMatch(/lean that way/);
  // Nothing is ruled out: no star fades, and every word stays possible, the birds weighing three times as much.
  expect(sky(view, 'out')).toBe(0);
  await tick();
  const knowledge = analyzeDecision.mock.calls.at(-1)[1];
  expect(knowledge.words).toEqual(QUESTION_WORDS);
  expect(knowledge.weights.get('heron')).toBe(30);
  expect(knowledge.weights.get('table')).toBe(10);
  for (let turn = 0; turn < 6 && !screen.queryByRole('heading', { name: 'You win!' }); turn++) {
    await tick(); await settle();
    const decline = screen.queryByRole('button', { name: 'Decline' });
    if (decline) fireEvent.click(decline);
  }
  expect(screen.getByRole('heading', { name: 'You win!' })).toBeTruthy();
  expect(screen.getByText('Experimental duels earn no points.')).toBeTruthy();
  expect(requests.some(([url]) => url === '/user/illucia/claim')).toBe(false);
});

it('owns a failed AI question and makes her normal move, once per letter', async () => {
  serveQuestions();
  const requests = serveApi({
    '/user/illucia/start': body => [200, experimentalTicket(body)],
    '/user/illucia/ask': () => [200, { ok: false, reason: 'budget', questionsLeft: 2 }],
  });
  await forceLetters('zqjxvk');
  const view = mount();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Experimental AI mode' }));
  await start('crane', 'Master');
  await tick(); await tick(); await tick();
  await settle();
  expect(view.container.querySelector('.obs-bubble').textContent).toBe('My AI helper is out of questions for now. Back to my own method.');
  expect(card(view)).toBeNull();
  await tick();
  expect(tape(view)).toEqual(['z', 'q', 'j']);
  expect(requests.filter(([url]) => url === '/user/illucia/ask')).toHaveLength(1);
});
