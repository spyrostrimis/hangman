import React, { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Illucia from './Illucia';
import { analyzeDecision } from '../lib/illucia/strategy.js';
import { replyLine } from '../lib/illucia/duel-lines.js';

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

const mount = () => render(<StrictMode><MemoryRouter><Illucia /></MemoryRouter></StrictMode>);
async function start(word = 'EERIE', tier = 'Master') {
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(tier) }));
  fireEvent.change(screen.getByLabelText('Your secret word'), { target: { value: word } });
  await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Start the duel' }).closest('form')); });
}
// Longer than her thinking pause, so at most one guess happens per call.
const think = () => act(async () => { await vi.advanceTimersByTimeAsync(1200); });
const hiddenTiles = () => screen.queryAllByRole('button', { name: /^Show [A-Z] at position/ });
const boards = container => [...container.querySelectorAll('.duel-board')].map(board =>
  [...board.querySelectorAll('.duel-tile')].map(tile => (tile.classList.contains('hidden') ? '#' : tile.textContent || '_')).join(''));
const bubbles = (container, from) => [...container.querySelectorAll(`.from-${from} .duel-bubble p`)].map(node => node.textContent);

it('sends only the length, hides her hits until the player shows them, and plays to her win', async () => {
  const view = mount();
  expect(screen.getByLabelText('Your secret word').type).toBe('text');
  expect(view.container.querySelector('input[type="password"]')).toBeNull();
  await start();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe('/illucia/words/5.txt');
  expect(Object.keys(fetch.mock.calls[0][1])).toEqual(['signal']);

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
  expect(screen.getByText(/Duels don't earn Hall of Fame points yet/)).toBeTruthy();
  const calls = analyzeDecision.mock.calls.length;
  await think();
  expect(analyzeDecision.mock.calls.length).toBe(calls);
  fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
  expect(screen.getByLabelText('Your secret word').value).toBe('');
});

it('waits for the player to answer a miss, answers that reply, and ends at six misses', async () => {
  fetch.mockResolvedValue({ ok: true, text: async () => 'abcd 35\nwxyz 70\n' });
  const view = mount(); await start('wxyz', 'Apprentice');
  await think();
  expect(analyzeDecision.mock.calls[0][1].words).toEqual(['abcd']);
  expect(hiddenTiles()).toHaveLength(0);
  // Positive control on the same round: a miss offers both replies and she waits.
  expect(screen.getByRole('button', { name: 'Oops, wrong' })).toBeTruthy();
  await think(); await think();
  expect(analyzeDecision).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: "That wasn't so smart ;)" }));
  expect(bubbles(view.container, 'player').at(-1)).toBe("That wasn't so smart ;)");
  const smart = replyLine('smart', { letter: 'a', turn: 1, count: 0, share: 100, length: 4, missesLeft: 5 });
  expect(bubbles(view.container, 'illucia').at(-1)).toBe(smart);
  expect(view.container.querySelectorAll('.duel-board-caption')[1].textContent).toBe('Turn 1 · A · miss');

  await think();
  fireEvent.click(screen.getByRole('button', { name: 'Oops, wrong' }));
  const oops = replyLine('oops', { letter: 'b', turn: 2, count: 0, share: 100, length: 4, missesLeft: 4 });
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
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('shows her count from before the guess until the player reveals the tiles', async () => {
  fetch.mockResolvedValue({ ok: true, text: async () => 'eerie 35\nsense 35\nthree 35\n' });
  const view = mount(); await start('eerie');
  const words = () => view.container.querySelector('.duel-status-facts b').textContent;
  expect(words()).toBe('3');
  await think();
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
  expect(fetch).not.toHaveBeenCalled();
  await start('zzzzz');
  expect(screen.getByRole('alert').textContent).toContain('cannot accept');
  expect(screen.getByLabelText('Your secret word')).toBeTruthy();
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
