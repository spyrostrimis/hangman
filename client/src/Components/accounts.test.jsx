import React, { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthProvider';
import AccountForm from './AccountForm';
import Illucia from './Illucia';
import IlluciaObservatory from './IlluciaObservatory';
import Halloffame from './Halloffame';
import { apiRequest, ApiError } from '../lib/api.js';
import { deriveCredential, registrationParameters } from '../lib/credential.js';
import { useRoundScore } from '../lib/use-round-score.js';

vi.mock('../lib/api.js', async original => ({ ...await original(), apiRequest: vi.fn() }));
vi.mock('../lib/credential.js', () => ({ deriveCredential: vi.fn(), registrationParameters: vi.fn() }));
const player = { id: 'player-id', username: 'Player', score: 0 };
const parameters = { salt: 'ab'.repeat(16), version: 1 };
beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(deriveCredential).mockResolvedValue('cd'.repeat(32));
  vi.mocked(registrationParameters).mockReturnValue(parameters);
  vi.mocked(apiRequest).mockImplementation(async path => {
    if (path === '/user/me') throw new ApiError('Guest', 401);
    throw new Error(`Unexpected request: ${path}`);
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
function form(signup = true) {
  return render(<MemoryRouter initialEntries={[signup ? '/signup' : '/login']}><AuthProvider><Routes>
    <Route path="/signup" element={<AccountForm signup />} />
    <Route path="/login" element={<AccountForm />} />
    <Route path="/" element={<p>Signed in destination</p>} />
  </Routes></AuthProvider></MemoryRouter>);
}
async function fillAndSubmit(signup = true) {
  const button = screen.getByRole('button', { name: signup ? 'Sign up' : 'Sign in' });
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'Player' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'A test passphrase long enough' } });
  fireEvent.submit(button.closest('form'));
}
describe('account forms', () => {
  it('keeps duplicate registration on the form; success navigates and sends no raw password', async () => {
    let duplicate = true;
    vi.mocked(apiRequest).mockImplementation(async path => {
      if (path === '/user/me') throw new ApiError('Guest', 401);
      if (path === '/user/signup' && duplicate) throw new ApiError('Username already exists.', 409);
      if (path === '/user/signup') return { user: player };
    });
    form(); await fillAndSubmit();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Username already exists.');
    expect(screen.queryByText('Signed in destination')).toBeNull();
    duplicate = false;
    await fillAndSubmit();
    expect(await screen.findByText('Signed in destination')).toBeTruthy();
    const body = apiRequest.mock.calls.find(([path]) => path === '/user/signup')[1].body;
    expect(body).toEqual({ username: 'Player', credential: 'cd'.repeat(32), ...parameters });
    expect(body).not.toHaveProperty('password');
  });
  it('limits new usernames to 20 characters but lets older accounts sign in with up to 35', () => {
    const signup = form();
    expect(screen.getByLabelText('Username').maxLength).toBe(20);
    expect(screen.getByLabelText('Username').getAttribute('pattern')).toBe('[A-Za-z0-9]{3,20}');
    // Just the form: no character picture on the account pages (the labelled field above is the positive control).
    expect(signup.container.querySelector('img')).toBeNull();
    signup.unmount();
    const login = form(false);
    expect(screen.getByLabelText('Username').maxLength).toBe(35);
    expect(screen.getByLabelText('Username').getAttribute('pattern')).toBe('[A-Za-z0-9]{3,35}');
    expect(login.container.querySelector('img')).toBeNull();
  });
  it('fetches parameters before stretching and handles wrong password without navigation', async () => {
    let wrong = true;
    vi.mocked(apiRequest).mockImplementation(async path => {
      if (path === '/user/me') throw new ApiError('Guest', 401);
      if (path === '/user/auth-params') return parameters;
      if (wrong) throw new ApiError('Invalid username or password.', 401);
      return { user: player };
    });
    form(false); await fillAndSubmit(false);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Invalid username or password.');
    expect(deriveCredential).toHaveBeenCalledWith('A test passphrase long enough', parameters);
    expect(screen.queryByText('Signed in destination')).toBeNull();
    wrong = false; await fillAndSubmit(false);
    expect(await screen.findByText('Signed in destination')).toBeTruthy();
  });
  it('blocks duplicate submissions while stretching and recovers after a network failure', async () => {
    let finish;
    vi.mocked(deriveCredential).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    vi.mocked(apiRequest).mockImplementation(async path => {
      if (path === '/user/me') throw new ApiError('Guest', 401);
      throw new ApiError('Network unavailable', 0);
    });
    form(); await fillAndSubmit();
    const pending = await screen.findByRole('button', { name: 'Please wait…' });
    fireEvent.submit(pending.closest('form'));
    expect(deriveCredential).toHaveBeenCalledTimes(1);
    finish('cd'.repeat(32));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Network unavailable');
    expect(screen.getByRole('button', { name: 'Sign up' }).disabled).toBe(false);
  });
});

function Round({ ticket, won }) {
  const { message, retry, canRetry } = useRoundScore(ticket, { answer: 'puzzle', guesses: won ? [...'puzle'] : [] });
  const { acceptUser, user } = useAuth();
  return <><p>{message}</p><p>{user?.username || 'Guest'}</p><button onClick={() => acceptUser(player)}>Set player</button>
    <button onClick={() => acceptUser({ ...player, id: 'other', username: 'Other' })}>Other account</button>
    {canRetry && <button onClick={retry}>Retry saving points</button>}</>;
}
function roundTree(ticket, won) {
  return <StrictMode><AuthProvider><Round ticket={ticket} won={won} /></AuthProvider></StrictMode>;
}
const scoreTicket = () => ({ roundId: crypto.randomUUID(), userId: player.id, claimNotBefore: performance.now() });
describe('round score lifecycle', () => {
  it('holds an early win behind Saving until 5000 ms, then claims once', async () => {
    vi.mocked(apiRequest).mockImplementation(async path => path === '/user/me' ? { user: player } : { score: 100 });
    const ticket = scoreTicket();
    const view = render(roundTree(ticket, false));
    await screen.findByText('Player');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    ticket.claimNotBefore = performance.now() + 5000;
    view.rerender(roundTree(ticket, true));
    expect(screen.getByText('Saving…')).toBeTruthy();
    const claims = () => apiRequest.mock.calls.filter(([path]) => path === '/user/round/claim');
    await act(async () => { await vi.advanceTimersByTimeAsync(4999); });
    expect(claims()).toHaveLength(0);
    expect(screen.queryByText(/Could not|Retry saving/)).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(claims()).toHaveLength(1);
    expect(screen.getByText('100 points saved! Your total is 100.')).toBeTruthy();
    view.rerender(roundTree(ticket, true));
    expect(claims()).toHaveLength(1);
  });

  it('silently waits and retries the same claim when the server says ROUND_TOO_EARLY', async () => {
    let calls = 0;
    vi.mocked(apiRequest).mockImplementation(async path => {
      if (path === '/user/me') return { user: player };
      if (++calls === 1) throw new ApiError('Too early', 409, { code: 'ROUND_TOO_EARLY', retryAfterMs: 25 });
      return { score: 100 };
    });
    const ticket = scoreTicket();
    const view = render(roundTree(ticket, false));
    await screen.findByText('Player');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    ticket.claimNotBefore = performance.now();
    await act(async () => { view.rerender(roundTree(ticket, true)); });
    expect(calls).toBe(1);
    expect(screen.getByText('Saving…')).toBeTruthy();
    expect(screen.queryByText(/no longer eligible|Retry saving/)).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(24); });
    expect(calls).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(calls).toBe(2);
    expect(screen.getByText('100 points saved! Your total is 100.')).toBeTruthy();
    const claims = apiRequest.mock.calls.filter(([path]) => path === '/user/round/claim');
    expect(claims[1][1].body).toEqual(claims[0][1].body);
  });

  it('does not send a delayed claim after navigating away', async () => {
    vi.mocked(apiRequest).mockImplementation(async path => path === '/user/me' ? { user: player } : { score: 100 });
    const ticket = scoreTicket();
    const view = render(roundTree(ticket, false));
    await screen.findByText('Player');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    ticket.claimNotBefore = performance.now() + 5000;
    view.rerender(roundTree(ticket, true));
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(apiRequest.mock.calls.filter(([path]) => path === '/user/round/claim')).toHaveLength(0);
    // The same ticket still saves when its winning screen is mounted again.
    await act(async () => { render(roundTree(ticket, true)); });
    expect(screen.getByText('100 points saved! Your total is 100.')).toBeTruthy();
    expect(apiRequest.mock.calls.filter(([path]) => path === '/user/round/claim')).toHaveLength(1);
  });

  it('saves once under StrictMode and rerenders, and again for a new round', async () => {
    vi.mocked(apiRequest).mockImplementation(async path => path === '/user/me' ? { user: player } : { score: 100 });
    const round = scoreTicket();
    const view = render(roundTree(round, false));
    await screen.findByText('Player');
    view.rerender(roundTree(round, true));
    await screen.findByText('100 points saved! Your total is 100.');
    view.rerender(roundTree(round, true));
    expect(apiRequest.mock.calls.filter(([path]) => path === '/user/round/claim')).toHaveLength(1);
    expect(apiRequest).toHaveBeenCalledWith('/user/round/claim', { method: 'POST', body: { roundId: round.roundId, guesses: [...'puzle'] } });
    view.rerender(roundTree(scoreTicket(), true));
    await waitFor(() => expect(apiRequest.mock.calls.filter(([path]) => path === '/user/round/claim')).toHaveLength(2));
  });
  it('does not save guest wins or losses, and does not award a past guest win on login', async () => {
    const round = null;
    const view = render(roundTree(round, false));
    await screen.findByText('Guest');
    view.rerender(roundTree(round, true));
    fireEvent.click(screen.getByText('Set player'));
    await screen.findByText('Player');
    expect(apiRequest.mock.calls.filter(([path]) => path === '/user/round/claim')).toHaveLength(0);
    apiRequest.mockImplementation(async () => ({ score: 100 }));
    view.rerender(roundTree(scoreTicket(), true));
    await screen.findByText('100 points saved! Your total is 100.');
    expect(apiRequest.mock.calls.filter(([path]) => path === '/user/round/claim')).toHaveLength(1);
  });
  it('offers a safe retry with the same ticket after a lost response and clears expired sessions', async () => {
    let expired = false;
    vi.mocked(apiRequest).mockImplementation(async path => {
      if (path === '/user/me') return { user: player };
      throw new ApiError('Failure', expired ? 401 : 0);
    });
    const round = scoreTicket();
    const view = render(roundTree(round, false)); await screen.findByText('Player');
    view.rerender(roundTree(round, true));
    await screen.findByText(/Could not confirm/);
    view.rerender(roundTree(round, true));
    expect(apiRequest.mock.calls.filter(([path]) => path === '/user/round/claim')).toHaveLength(1);
    fireEvent.click(screen.getByText('Retry saving points'));
    await screen.findByText('Retry saving points');
    const claims = apiRequest.mock.calls.filter(([path]) => path === '/user/round/claim');
    expect(claims).toHaveLength(2);
    expect(claims[1][1].body).toEqual(claims[0][1].body);
    expired = true; view.rerender(roundTree(scoreTicket(), true));
    await screen.findByText(/Your session expired/); await screen.findByText('Guest');
  });
  it('does not send an account-owned claim after switching to another account', async () => {
    vi.mocked(apiRequest).mockImplementation(async () => ({ user: player }));
    const ticket = scoreTicket();
    const view = render(roundTree(ticket, false));
    await screen.findByText('Player');
    fireEvent.click(screen.getByText('Other account'));
    view.rerender(roundTree(ticket, true));
    expect(apiRequest.mock.calls.filter(([path]) => path === '/user/round/claim')).toHaveLength(0);
  });
});

it('shows guests a registered-only notice on both Illucia pages and admits a signed-in player', async () => {
  const tree = path => <MemoryRouter initialEntries={[path]}><AuthProvider><Routes>
    <Route path="/illucia" element={<Illucia />} />
    <Route path="/illucia-observatory" element={<IlluciaObservatory />} />
    <Route path="/login" element={<p>Login gate</p>} />
  </Routes></AuthProvider></MemoryRouter>;
  for (const path of ['/illucia', '/illucia-observatory']) {
    const guest = render(tree(path));
    expect(await screen.findByText(/Only for/)).toBeTruthy();
    expect(screen.getByText(/Only for/).textContent).toBe('Only for registered players');
    // No redirect to the sign-in form, and no game for guests.
    expect(screen.queryByText('Login gate')).toBeNull();
    expect(screen.queryByLabelText(/secret word/i)).toBeNull();
    expect(screen.getByRole('link', { name: 'registered' }).getAttribute('href')).toBe('/login');
    // Guests do not see Illucia herself.
    expect(screen.queryByRole('img', { name: /Illucia/ })).toBeNull();
    guest.unmount();
  }
  apiRequest.mockResolvedValue({ user: player });
  const member = render(tree('/illucia')); expect(await screen.findByLabelText('Your secret word')).toBeTruthy();
  expect(screen.queryByText(/Only for/)).toBeNull();
  member.unmount();
  // Positive control: a registered player does see her on the Observatory.
  render(tree('/illucia-observatory'));
  expect(await screen.findByRole('img', { name: /^Illucia, a white robot/ })).toBeTruthy();
});

it('renders leaderboard loading, populated, empty and failure states without hanging', async () => {
  let finish;
  apiRequest.mockImplementation(path => path === '/user/me'
    ? Promise.resolve({ user: player }) : new Promise(resolve => { finish = resolve; }));
  const tree = () => <MemoryRouter><AuthProvider><Halloffame /></AuthProvider></MemoryRouter>;
  let view = render(tree());
  expect(screen.getByText('Loading scores…')).toBeTruthy();
  finish([{ username: 'Player', score: 100 }]);
  expect(await screen.findByRole('cell', { name: '100' })).toBeTruthy();
  expect(screen.queryByText('Loading scores…')).toBeNull(); view.unmount();
  apiRequest.mockImplementation(async path => path === '/user/me' ? { user: player } : []);
  view = render(tree()); await screen.findByText('No scores yet.'); view.unmount();
  apiRequest.mockImplementation(async path => {
    if (path === '/user/me') return { user: player };
    throw new ApiError('Offline', 0);
  });
  render(tree()); await screen.findByText('Scores are unavailable right now. Please try again later.');
  expect(screen.queryByRole('table')).toBeNull();
});
