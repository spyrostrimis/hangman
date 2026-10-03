import React, { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import IlluciaObservatory from './IlluciaObservatory';
import { analyzeDecision } from '../lib/illucia/strategy.js';
import { newLocalSeed } from '../lib/illucia/random.js';

vi.mock('./AuthProvider', () => ({ useAuth: () => ({ user: { id: 'test-player', username: 'tester' }, status: 'authenticated' }) }));
vi.mock('../lib/illucia/strategy.js', async original => ({ ...await original(), analyzeDecision: vi.fn() }));
vi.mock('../lib/illucia/random.js', async original => ({ ...await original(), newLocalSeed: vi.fn(() => 1234) }));
beforeEach(async () => {
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
}
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
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe('/illucia/words/5.txt');
  expect(Object.keys(fetch.mock.calls[0][1])).toEqual(['signal']);
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
  expect(screen.getByText(/Duels don't earn Hall of Fame points yet/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Rematch vs Scholar' }));
  expect(screen.getByText('Scholar')).toBeTruthy();
  expect(tape(view)).toEqual([]);
  expect(fetch).toHaveBeenCalledTimes(1);
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
  expect(fetch).not.toHaveBeenCalled();
  await start('zzzzz');
  expect(screen.getByRole('alert').textContent).toContain('cannot accept');
  expect(screen.getByLabelText('Insert your secret word')).toBeTruthy();
});

it('asks for 4-15 letters and never fetches a 3-letter word file', async () => {
  mount(); await start('cat');
  expect(screen.getByRole('alert').textContent).toBe('Choose 4–15 letters, A–Z only, with no spaces or punctuation.');
  expect(fetch).not.toHaveBeenCalled();
  // Positive control: four letters pass the shape check and load that length.
  fetch.mockResolvedValue({ ok: true, text: async () => 'cats 35\n' });
  await start('cats');
  expect(fetch.mock.calls[0][0]).toBe('/illucia/words/4.txt');
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
