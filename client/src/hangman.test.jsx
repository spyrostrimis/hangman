import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

function play() {
  const view = render(
    <MemoryRouter initialEntries={['/hangman']}>
      <AuthProvider><App /></AuthProvider>
    </MemoryRouter>
  );
  return view;
}
const key = letter => screen.getByRole('button', { name: letter });
const click = letter => fireEvent.click(key(letter));
const press = letter => act(() => { fireEvent.keyPress(document, { key: letter, charCode: letter.charCodeAt(0) }); });
const slots = container => [...container.querySelectorAll('.word > span > span')];
const visible = container => slots(container).map(slot => slot.style.visibility === 'visible' ? slot.textContent : '_').join('');
const panel = container => container.querySelector('.wordfactscontainerinner').textContent;

describe('/hangman game rules', () => {
  it('reveals every occurrence of a hit and marks the key as used', () => {
    const { container } = play();
    expect(visible(container)).toBe('______');
    click('z');
    expect(visible(container)).toBe('__zz__');
    expect(key('z').className).toContain('active');
    expect(key('z').disabled).toBe(true);
    // Positive control: an unguessed key is still usable.
    expect(key('p').disabled).toBe(false);
  });

  it('counts down remaining tries on misses and leaves the message alone on hits', () => {
    const { container } = play();
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

  it('ends in a loss on the sixth miss: word revealed, keyboard locked, word facts shown', () => {
    const { container } = play();
    MISSES.slice(0, 5).forEach(click);
    expect(container.querySelector('.word.revealed')).toBeNull();
    click(MISSES[5]);
    expect(container.querySelector('.word.revealed')).not.toBeNull();
    expect(visible(container)).toBe('puzzle');
    expect(key('p').disabled).toBe(true);
    expect(panel(container)).toContain('Definition:');
  });

  it('ends in a win when every distinct letter is found, then ignores further guesses', () => {
    const { container } = play();
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

  it('accepts lowercase guesses from the physical keyboard after the first key', () => {
    const { container } = play();
    press('a');
    press('z');
    expect(visible(container)).toBe('__zz__');
    expect(key('a').className).toContain('inactive');
    press('b');
    expect(panel(container)).toBe('You have 4 tries remaining...');
  });

  it('counts a correct first physical key only once and never as a miss', () => {
    const { container } = play();
    press('z');
    expect(visible(container)).toBe('__zz__');
    expect(panel(container)).not.toContain('tries');
    // Positive control: the first real miss still gets the full countdown.
    press('a');
    expect(panel(container)).toBe('You have 5 tries remaining...');
  });

  it('treats an uppercase physical key (Caps Lock) like its lowercase letter', () => {
    const { container } = play();
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

  it('keeps the answer out of the page text before it is guessed', () => {
    const { container } = play();
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
