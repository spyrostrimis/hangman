import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Intro from './Intro';
import { useAuth } from './AuthProvider';

vi.mock('./AuthProvider', () => ({ useAuth: vi.fn() }));
afterEach(cleanup);
const mount = () => render(<MemoryRouter><Intro /></MemoryRouter>);

it('opens one crew file at a time from its own button and leaves the others closed', () => {
  vi.mocked(useAuth).mockReturnValue({ user: { id: 'p', username: 'Player', score: 0 }, status: 'authenticated' });
  mount();
  const [han, artsy, illucia] = screen.getAllByRole('button', { name: 'Open file' });
  const bio = button => document.getElementById(button.getAttribute('aria-controls'));
  expect(bio(illucia).hidden).toBe(true);
  fireEvent.click(illucia);
  expect(illucia.getAttribute('aria-expanded')).toBe('true');
  expect(bio(illucia).hidden).toBe(false);
  expect(bio(illucia).textContent).toContain("Professor Fastolfe's daughter");
  // Negative controls on the same render.
  expect(bio(han).hidden).toBe(true);
  expect(bio(artsy).hidden).toBe(true);
  fireEvent.click(illucia);
  expect(bio(illucia).hidden).toBe(true);
  expect(screen.queryByText(/earn 100 points per rescue/)).toBeNull();
});

it('sends players to both games and invites guests to sign in', () => {
  vi.mocked(useAuth).mockReturnValue({ user: null, status: 'guest' });
  mount();
  expect(screen.getByRole('link', { name: 'Play Hangman' }).getAttribute('href')).toBe('/hangman');
  expect(screen.getByRole('link', { name: 'Challenge Illucia' }).getAttribute('href')).toBe('/illucia-observatory');
  expect(screen.getByText(/earn 100 points per rescue/)).toBeTruthy();
});
