import React, { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Illucia from './Illucia';
import { chooseLetter } from '../lib/illucia/strategy.js';

vi.mock('./AuthProvider', () => ({ useAuth: () => ({ user: { id: 'test-player' }, status: 'authenticated' }) }));
vi.mock('../lib/illucia/strategy.js', async original => ({ ...await original(), chooseLetter: vi.fn() }));
let realChoose;
beforeEach(async () => {
  realChoose = (await vi.importActual('../lib/illucia/strategy.js')).chooseLetter;
  chooseLetter.mockImplementation(realChoose);
  chooseLetter.mockClear();
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => 'eerie 35\n' }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const mount = () => render(<StrictMode><MemoryRouter><Illucia /></MemoryRouter></StrictMode>);
async function start(word = 'EERIE', tier = 'Master') {
  fireEvent.click(screen.getByLabelText(tier));
  fireEvent.change(screen.getByLabelText('Your secret word'), { target: { value: word } });
  await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Challenge Illucia' }).closest('form')); });
}
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(1100); });

it('loads only the length, clears the secret, uses public state, reveals repeated letters and stops after winning', async () => {
  const view = mount();
  // A password field would let browsers offer to save and sync the secret as a credential.
  const secretInput = screen.getByLabelText('Your secret word');
  expect(secretInput.type).toBe('text');
  expect(secretInput.getAttribute('autocomplete')).toBe('off');
  expect(view.container.querySelectorAll('input').length).toBeGreaterThan(0);
  expect(view.container.querySelector('input[type="password"]')).toBeNull();
  await start();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe('/illucia/words/5.txt');
  expect(Object.keys(fetch.mock.calls[0][1])).toEqual(['signal']);
  expect(screen.getByRole('heading', { name: 'Master Illucia' })).toBeTruthy();
  expect(view.container.querySelector('input')).toBeNull();
  expect(view.container.textContent.toLowerCase()).not.toContain('eerie');
  expect(screen.queryByText(/Final suspects:/)).toBeNull();
  await tick();
  expect(screen.getByRole('status').textContent).toContain('E · HIT · 3 positions');
  expect(screen.getByText('6 of 6 misses left')).toBeTruthy();
  expect(chooseLetter.mock.calls[0][0].pattern).toEqual([null, null, null, null, null]);
  expect(chooseLetter.mock.calls[0][0]).not.toHaveProperty('answer');
  await tick(); await tick();
  expect(screen.getByRole('heading', { name: 'Illucia wins' })).toBeTruthy();
  expect(screen.getByText('EERIE')).toBeTruthy();
  expect(screen.getByText('Final suspects: eerie.')).toBeTruthy();
  expect(chooseLetter).toHaveBeenCalledTimes(3);
  await tick();
  expect(chooseLetter).toHaveBeenCalledTimes(3);
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
  expect(screen.getByLabelText('Your secret word').value).toBe('');
});

it('keeps low-tier fallback in its own vocabulary and ends at six misses without scoring', async () => {
  fetch.mockResolvedValue({ ok: true, text: async () => 'abc 35\nxyz 70\n' });
  mount(); await start('xyz', 'Apprentice');
  for (let index = 0; index < 6; index++) await tick();
  expect(screen.getByRole('heading', { name: 'You win!' })).toBeTruthy();
  expect(screen.getByText('0 of 6 misses left')).toBeTruthy();
  expect(screen.getByText(/came from letter frequencies in her own vocabulary/)).toBeTruthy();
  expect(chooseLetter.mock.calls[1][1].words).toEqual(['abc']);
  expect(chooseLetter.mock.calls[1][1].words).not.toContain('xyz');
  expect(screen.getByText('XYZ')).toBeTruthy();
  expect(screen.getByLabelText('F: miss')).toBeTruthy();
  expect(chooseLetter).toHaveBeenCalledTimes(6);
  await tick();
  expect(chooseLetter).toHaveBeenCalledTimes(6);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('cancels a pending turn on restart and unmount, and a new game advances normally', async () => {
  const view = mount(); await start(); await tick();
  expect(chooseLetter).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Choose another word' }));
  await tick();
  expect(chooseLetter).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Your secret word').value).toBe('');
  await start(); await tick();
  expect(chooseLetter).toHaveBeenCalledTimes(2);
  view.unmount(); await tick();
  expect(chooseLetter).toHaveBeenCalledTimes(2);
});

it('rejects invalid syntax, unlisted and blocked words, then accepts a valid word on the same form', async () => {
  mount(); await start('two words');
  expect(screen.getByRole('alert').textContent).toContain('A–Z only');
  expect(fetch).not.toHaveBeenCalled();
  await start('zzzzz');
  expect(screen.getByRole('alert').textContent).toContain('cannot accept');
  expect(screen.getByLabelText('Your secret word')).toBeTruthy();
  await start('bitch');
  expect(screen.getByRole('alert').textContent).toContain('cannot accept');
  await start('eerie');
  expect(screen.getByRole('heading', { name: 'Master Illucia' })).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('recovers from a vocabulary failure, prevents duplicate loads, and aborts when leaving setup', async () => {
  fetch.mockRejectedValueOnce(new Error('offline'));
  const view = mount(); await start();
  expect(screen.getByRole('alert').textContent).toContain('could not load');
  let resolve;
  fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await start();
  const button = screen.getByRole('button', { name: 'Challenge Illucia' });
  expect(button.closest('fieldset').disabled).toBe(true);
  fireEvent.submit(button.closest('form'));
  expect(fetch).toHaveBeenCalledTimes(2);
  const signal = fetch.mock.calls[1][1].signal;
  expect(signal.aborted).toBe(false);
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ ok: true, text: async () => 'eerie 35\n' }));
  mount(); await start();
  expect(screen.getByRole('heading', { name: 'Master Illucia' })).toBeTruthy();
});

it('shows a recoverable error when the solver fails instead of inventing an outcome', async () => {
  mount(); await start();
  chooseLetter.mockImplementationOnce(() => { throw new Error('Master invariant: zero candidates.'); });
  await tick();
  expect(screen.getByRole('alert').textContent).toContain('could not continue');
  expect(screen.queryByRole('heading', { name: 'You win!' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Illucia wins' })).toBeNull();
  expect(chooseLetter).toHaveBeenCalledTimes(1);
  await tick();
  expect(chooseLetter).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Choose another word' }));
  await start(); await tick();
  expect(screen.getByRole('status').textContent).toContain('Turn 1');
});

it('times out a stalled download and allows retry', async () => {
  fetch.mockImplementationOnce((url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  mount(); await start();
  expect(screen.getByRole('status').textContent).toContain('Loading');
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain('could not load');
  await start();
  expect(screen.getByRole('heading', { name: 'Master Illucia' })).toBeTruthy();
});
