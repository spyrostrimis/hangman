import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './Components/AuthProvider';
import manifest from './data/words.json';
import { apiRequest, ApiError } from './lib/api.js';
import { selectRandomWord } from './lib/word-data.js';

vi.mock('./lib/api.js', async original => ({ ...await original(), apiRequest: vi.fn() }));
vi.mock('./lib/word-data.js', async original => ({ ...await original(), selectRandomWord: vi.fn() }));

// "puzzle" repeats z, so one hit reveals two slots; five distinct letters win.
const PUZZLE = manifest.words.find(record => record.word === 'puzzle');
const MISSES = ['a', 'b', 'c', 'd', 'f', 'g'];

beforeEach(() => {
  vi.mocked(selectRandomWord).mockReturnValue(PUZZLE);
  vi.mocked(apiRequest).mockImplementation(async path => {
    if (path === '/user/me') throw new ApiError('Guest', 401);
    throw new Error(`Unexpected request: ${path}`);
  });
});
afterEach(cleanup);

async function play() {
  const view = render(
    <MemoryRouter initialEntries={['/hangman']}>
      <AuthProvider><App /></AuthProvider>
    </MemoryRouter>
  );
  await waitFor(() => expect(key('a').disabled).toBe(false));
  return view;
}
const key = letter => screen.getByRole('button', { name: letter });
const click = letter => fireEvent.click(key(letter));
const press = letter => act(() => { fireEvent.keyPress(document, { key: letter, charCode: letter.charCodeAt(0) }); });
const slots = container => [...container.querySelectorAll('.word > span > span')];
const visible = container => slots(container).map(slot => slot.style.visibility === 'visible' ? slot.textContent : '_').join('');
const panel = container => container.querySelector('.wordfactscontainerinner').textContent;

describe('/hangman game rules', () => {
  it('reveals every occurrence of a hit and marks the key as used', async () => {
    const { container } = await play();
    expect(visible(container)).toBe('______');
    click('z');
    expect(visible(container)).toBe('__zz__');
    expect(key('z').className).toContain('active');
    expect(key('z').disabled).toBe(true);
    // Positive control: an unguessed key is still usable.
    expect(key('p').disabled).toBe(false);
  });

  it('counts down remaining tries on misses and leaves the message alone on hits', async () => {
    const { container } = await play();
    click('a');
    expect(panel(container)).toBe('You have 5 tries remaining...');
    click('p');
    expect(panel(container)).toBe('You have 5 tries remaining...');
    click('b'); click('c'); click('d');
    expect(panel(container)).toBe('You have 2 tries remaining...');
    click('f');
    expect(panel(container)).toBe('You have only 1 try left... make it count!');
    expect(key('f').className).toContain('inactive');
  });

  it('ends in a loss on the sixth miss: word revealed, keyboard locked, word facts shown', async () => {
    const { container } = await play();
    MISSES.slice(0, 5).forEach(click);
    expect(container.querySelector('.word.revealed')).toBeNull();
    click(MISSES[5]);
    expect(container.querySelector('.word.revealed')).not.toBeNull();
    expect(visible(container)).toBe('puzzle');
    expect(key('p').disabled).toBe(true);
    expect(panel(container)).toContain('Definition:');
  });

  it('ends in a win when every distinct letter is found, then ignores further guesses', async () => {
    const { container } = await play();
    ['p', 'u', 'z', 'l'].forEach(click);
    expect(container.querySelector('.word.revealed')).toBeNull();
    click('e');
    expect(container.querySelector('.word.revealed')).not.toBeNull();
    expect(visible(container)).toBe('puzzle');
    expect(key('a').disabled).toBe(true);
    expect(panel(container)).toContain('Definition:');
    press('a');
    expect(key('a').className).not.toContain('inactive');
  });

  it('accepts lowercase guesses from the physical keyboard after the first key', async () => {
    const { container } = await play();
    press('a');
    press('z');
    expect(visible(container)).toBe('__zz__');
    expect(key('a').className).toContain('inactive');
    press('b');
    expect(panel(container)).toBe('You have 4 tries remaining...');
  });

  it('counts a correct first physical key only once and never as a miss', async () => {
    const { container } = await play();
    press('z');
    expect(visible(container)).toBe('__zz__');
    expect(panel(container)).not.toContain('tries');
    // Positive control: the first real miss still gets the full countdown.
    press('a');
    expect(panel(container)).toBe('You have 5 tries remaining...');
  });

  it('treats an uppercase physical key (Caps Lock) like its lowercase letter', async () => {
    const { container } = await play();
    press('a');
    press('Z');
    expect(visible(container)).toBe('__zz__');
    expect(key('z').className).toContain('active');
    expect(panel(container)).toBe('You have 5 tries remaining...');
    // Positive control: an uppercase miss still counts as a miss.
    press('B');
    expect(key('b').className).toContain('inactive');
    expect(panel(container)).toBe('You have 4 tries remaining...');
  });

  it('keeps the answer out of the page text before it is guessed', async () => {
    const { container } = await play();
    const readable = container.cloneNode(true);
    readable.querySelectorAll('[style*="visibility: hidden"]').forEach(node => node.remove());
    expect(readable.textContent).not.toContain('puzzle');
    // Positive control: the same check sees the word once it is revealed.
    'puzle'.split('').forEach(click);
    const solved = container.cloneNode(true);
    solved.querySelectorAll('[style*="visibility: hidden"]').forEach(node => node.remove());
    expect(solved.textContent).toContain('puzzle');
  });
});

describe('/hangman console and rounds', () => {
  const ATLANTIS = manifest.words.find(record => record.word === 'atlantis');

  it('fills the reboot bar from revealed slots and empties one attempt cell per miss', async () => {
    await play();
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByRole('img', { name: '6 of 6 attempts left' })).toBeTruthy();
    click('z');
    expect(bar.getAttribute('aria-valuenow')).toBe('33');
    // Positive control: a hit leaves the attempts alone, a miss removes one.
    expect(screen.getByRole('img', { name: '6 of 6 attempts left' })).toBeTruthy();
    click('a');
    expect(screen.getByRole('img', { name: '5 of 6 attempts left' })).toBeTruthy();
    expect(bar.getAttribute('aria-valuenow')).toBe('33');
  });

  it('plays again in place with a different word and a fresh board', async () => {
    vi.mocked(selectRandomWord).mockReturnValueOnce(PUZZLE).mockReturnValueOnce(PUZZLE).mockReturnValue(ATLANTIS);
    const { container } = await play();
    'puzle'.split('').forEach(click);
    expect(panel(container)).toContain('Definition:');
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
    expect(slots(container)).toHaveLength(8);
    expect(visible(container)).toBe('________');
    expect(key('p').disabled).toBe(false);
    expect(key('p').className).not.toContain('active');
    expect(panel(container)).not.toContain('Definition:');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByRole('img', { name: '6 of 6 attempts left' })).toBeTruthy();
    click('a');
    expect(visible(container)).toBe('a__a____');
  });

  it('shows the saved score to a signed-in winner', async () => {
    vi.mocked(apiRequest).mockImplementation(async path => {
      if (path === '/user/me') return { user: { id: 'player-id', username: 'Player', score: 0 } };
      if (path === '/user/round/start') return { roundId: 'ticket-id', word: 'puzzle', issuedAt: Date.now() - 5000, serverNow: Date.now(), expiresAt: Date.now() + 1800000 };
      if (path === '/user/round/claim') return { score: 100 };
      throw new Error(`Unexpected request: ${path}`);
    });
    await play();
    await screen.findByText('Player');
    expect(screen.queryByText(/points saved/)).toBeNull();
    'puzle'.split('').forEach(click);
    expect(await screen.findByText('100 points saved! Your total is 100.')).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('/user/round/claim', {
      method: 'POST', body: { roundId: 'ticket-id', guesses: [...'puzle'] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
    await waitFor(() => expect(key('p').disabled).toBe(false));
    expect(apiRequest).toHaveBeenCalledWith('/user/round/start', { method: 'POST', body: { previousRoundId: 'ticket-id' } });
    expect(screen.queryByText(/points saved/)).toBeNull();
  });

  it('keeps an API failure playable as an explicitly unranked round and never claims it', async () => {
    vi.mocked(apiRequest).mockImplementation(async path => {
      if (path === '/user/me') return { user: { id: 'player-id', username: 'Player', score: 0 } };
      throw new ApiError('Offline', 0);
    });
    await play();
    expect(screen.getByText(/This round is unranked/)).toBeTruthy();
    [...'puzle'].forEach(click);
    expect(apiRequest.mock.calls.filter(([path]) => path === '/user/round/claim')).toHaveLength(0);
  });
});
