import React, { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import IlluciaObservatory from './IlluciaObservatory';
import { analyzeDecision } from '../lib/illucia/strategy.js';

vi.mock('./AuthProvider', () => ({ useAuth: () => ({ user: { id: 'test-player', username: 'tester' }, status: 'authenticated' }) }));
vi.mock('../lib/illucia/strategy.js', async original => ({ ...await original(), analyzeDecision: vi.fn() }));
beforeEach(async () => {
  const real = (await vi.importActual('../lib/illucia/strategy.js')).analyzeDecision;
  analyzeDecision.mockImplementation(real);
  analyzeDecision.mockClear();
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
  fetch.mockResolvedValue({ ok: true, text: async () => 'abcd 35\nwxyz 70\n' });
  const view = mount(); await start('wxyz', 'Apprentice');
  expect(analyzeDecision.mock.calls[0][1].words).toEqual(['abcd']);
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
