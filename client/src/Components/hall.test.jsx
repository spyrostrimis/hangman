import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Halloffame, { ordinal, rankScores } from './Halloffame';
import { useAuth } from './AuthProvider';
import { loadLeaderboard } from '../lib/leaderboard.js';

vi.mock('./AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('../lib/leaderboard.js', () => ({ loadLeaderboard: vi.fn() }));
afterEach(cleanup);

it('gives equal scores the same place and skips the places they fill', () => {
  const ranked = rankScores([{ username: 'a', score: 300 }, { username: 'b', score: 100 }, { username: 'c', score: 100 }, { username: 'd', score: 0 }]);
  expect(ranked.map(entry => entry.rank)).toEqual([1, 2, 2, 4]);
  expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal))
    .toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th']);
});

it('marks the signed-in player row and summarises their place', async () => {
  vi.mocked(useAuth).mockReturnValue({ user: { id: 'p', username: 'Player', score: 100 }, status: 'authenticated' });
  vi.mocked(loadLeaderboard).mockResolvedValue([
    { username: 'Ace', score: 1200 }, { username: 'Player', score: 100 }, { username: 'Other', score: 100 },
  ]);
  render(<MemoryRouter><Halloffame /></MemoryRouter>);
  const mine = (await screen.findByText('You')).closest('tr');
  expect(mine.getAttribute('aria-current')).toBe('true');
  expect(within(mine).getByText('2nd')).toBeTruthy();
  // Negative control: the tied player shares the place but is not marked.
  const other = screen.getByText('Other').closest('tr');
  expect(other.getAttribute('aria-current')).toBeNull();
  expect(within(other).getByText('2nd')).toBeTruthy();
  expect(screen.getByRole('cell', { name: '1,200' })).toBeTruthy();
  expect(screen.getByText(/You are/).textContent).toBe('You are 2nd with 100 points.');
  expect(screen.queryByText(/Let's get competitive/)).toBeNull();
});
