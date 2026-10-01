import React, { StrictMode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider } from '../Components/AuthProvider';
import { apiRequest } from './api.js';
import { useHangmanRound } from './use-hangman-round.js';

vi.mock('./api.js', async original => ({ ...await original(), apiRequest: vi.fn() }));
const player = { id: 'player-id', username: 'Player', score: 0 };
const ticket = { roundId: 'ticket', word: 'puzzle', expiresAt: Date.now() + 1800000 };
const wrapper = ({ children }) => <StrictMode><AuthProvider>{children}</AuthProvider></StrictMode>;
beforeEach(() => { vi.mocked(apiRequest).mockReset(); });
afterEach(cleanup);

it('keeps play available and labels it unranked when session restoration fails', async () => {
  vi.mocked(apiRequest).mockRejectedValue(new Error('Offline'));
  const { result } = renderHook(() => useHangmanRound(true), { wrapper });
  await waitFor(() => expect(result.current.round).not.toBeNull());
  expect(result.current.note).toContain('unranked');
  expect(result.current.ticket).toBeNull();
  expect(apiRequest.mock.calls.every(([path]) => path === '/user/me')).toBe(true);
});

it('ignores guesses while starting, and discards a start response after navigation', async () => {
  let finish;
  vi.mocked(apiRequest).mockImplementation(async path => {
    if (path === '/user/me') return { user: player };
    return new Promise(resolve => { finish = resolve; });
  });
  const { result, rerender } = renderHook(({ enabled }) => useHangmanRound(enabled), { wrapper, initialProps: { enabled: true } });
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  act(() => result.current.guess('p'));
  expect(result.current.round).toBeNull();
  expect(result.current.loading).toBe(true);
  rerender({ enabled: false });
  await act(async () => finish(ticket));
  expect(result.current.round).toBeNull();
  expect(result.current.selectedWord).toBeNull();
});

it('starts from the server word and ignores a stale response when a newer start finishes first', async () => {
  const finish = [];
  vi.mocked(apiRequest).mockImplementation(async path => {
    if (path === '/user/me') return { user: player };
    return new Promise(resolve => finish.push(resolve));
  });
  const { result } = renderHook(() => useHangmanRound(true), { wrapper });
  await waitFor(() => expect(finish).toHaveLength(1));
  act(() => { void result.current.startRound(); });
  await act(async () => finish[1]({ ...ticket, roundId: 'newer', word: 'atlantis' }));
  await act(async () => finish[0](ticket));
  expect(result.current.selectedWord.word).toBe('atlantis');
  expect(result.current.ticket.roundId).toBe('newer');
  act(() => result.current.guess('a'));
  expect(result.current.round.guesses).toEqual(['a']);
});
