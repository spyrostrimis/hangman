import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from './Navbar';
import { useAuth } from './AuthProvider';

vi.mock('./AuthProvider', () => ({ useAuth: vi.fn() }));
afterEach(cleanup);
const mount = path => render(<MemoryRouter initialEntries={[path]}><Navbar /></MemoryRouter>);

it('marks only the current page and shows the signed-in player with their points', () => {
  vi.mocked(useAuth).mockReturnValue({ user: { id: 'p', username: 'Player', score: 1200 }, status: 'authenticated' });
  mount('/hall-of-fame');
  expect(screen.getByRole('link', { name: 'Hall of Fame' }).getAttribute('aria-current')).toBe('page');
  // Negative controls on the same render: other links stay unmarked.
  expect(screen.getByRole('link', { name: 'HOMEWORLD' }).getAttribute('aria-current')).toBeNull();
  expect(screen.getByRole('link', { name: 'Play vs AI' }).getAttribute('aria-current')).toBeNull();
  expect(screen.getByText('Player')).toBeTruthy();
  expect(screen.getByText('1,200 pts')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Logout' })).toBeTruthy();
});

it('keeps Play vs AI and Illucia apart, and offers sign-in to guests', () => {
  vi.mocked(useAuth).mockReturnValue({ user: null, status: 'guest' });
  mount('/illucia-observatory');
  expect(screen.getByRole('link', { name: 'Illucia' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('link', { name: 'Play vs AI' }).getAttribute('aria-current')).toBeNull();
  expect(screen.getByRole('link', { name: 'Sign In' })).toBeTruthy();
  expect(screen.queryByText(/pts$/)).toBeNull();
});
