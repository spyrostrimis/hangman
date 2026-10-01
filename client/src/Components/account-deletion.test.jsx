import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Account from './Account';
import Navbar from './Navbar';
import { AuthProvider } from './AuthProvider';
import { apiRequest, ApiError } from '../lib/api.js';
import { deriveCredential } from '../lib/credential.js';

vi.mock('../lib/api.js', async original => ({ ...await original(), apiRequest: vi.fn() }));
vi.mock('../lib/credential.js', () => ({ deriveCredential: vi.fn() }));
const user = { id: 'owner', username: 'Player', score: 100 };
const parameters = { salt: 'ab'.repeat(16), version: 1 };
beforeEach(() => { vi.clearAllMocks(); deriveCredential.mockResolvedValue('cd'.repeat(32)); });
afterEach(cleanup);
const view = () => render(<MemoryRouter><AuthProvider><Navbar /><Account /></AuthProvider></MemoryRouter>);
const submit = () => {
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'A re-entered password' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Delete my account permanently' }).closest('form'));
};

it('hides deletion and its nav link from guests, then shows both for an authenticated account', async () => {
  apiRequest.mockRejectedValue(new ApiError('Guest', 401));
  const guest = view();
  await screen.findByText(/to manage your account/);
  expect(screen.queryByLabelText('Password')).toBeNull();
  expect(screen.queryByRole('link', { name: 'Account' })).toBeNull();
  guest.unmount(); apiRequest.mockResolvedValue({ user }); view();
  await screen.findByLabelText('Password');
  expect(screen.getByRole('link', { name: 'Account' }).getAttribute('href')).toBe('/account');
  expect(screen.getByText(/Deletion is permanent/).textContent).toContain('Hall of Fame');
  expect(screen.getByText(/Deletion is permanent/).textContent).toContain('There is no recovery.');
});

it('derives the login proof, blocks duplicate pending submissions, keeps errors and signs out only after success', async () => {
  let finish;
  apiRequest.mockImplementation(async path => {
    if (path === '/user/me') return { user };
    if (path === '/user/auth-params') return parameters;
    return new Promise(resolve => { finish = resolve; });
  });
  view(); await screen.findByLabelText('Password'); submit();
  const pending = await screen.findByRole('button', { name: 'Deleting…' });
  expect(pending.disabled).toBe(true);
  expect(screen.getByLabelText('Password').disabled).toBe(true);
  fireEvent.submit(pending.closest('form'));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/user/delete-account', { method: 'POST', body: { credential: 'cd'.repeat(32) } }));
  expect(deriveCredential).toHaveBeenCalledExactlyOnceWith('A re-entered password', parameters);
  expect(apiRequest.mock.calls.filter(([p]) => p === '/user/delete-account')).toHaveLength(1);
  finish({ ok: false });
  await screen.findByRole('alert');
  expect(screen.getByRole('link', { name: 'Account' })).toBeTruthy();
  apiRequest.mockImplementation(async path => {
    if (path === '/user/auth-params') return parameters;
    throw new ApiError('Incorrect password. Your account has not been deleted.', 403);
  });
  submit(); await screen.findByText('Incorrect password. Your account has not been deleted.');
  expect(screen.getByRole('button', { name: 'Delete my account permanently' }).disabled).toBe(false);
  apiRequest.mockImplementation(async path => path === '/user/auth-params' ? parameters : { ok: true });
  submit(); await screen.findByText('Your account has been deleted. You are signed out.');
  expect(screen.queryByRole('link', { name: 'Account' })).toBeNull();
  expect(screen.queryByLabelText('Password')).toBeNull();
  expect(screen.getByRole('link', { name: 'Play as a guest' })).toBeTruthy();
});

it('clears an expired session while retaining the error explanation', async () => {
  apiRequest.mockImplementation(async path => path === '/user/me' ? { user } : path === '/user/auth-params' ? parameters : Promise.reject(new ApiError('Please sign in.', 401)));
  view(); await screen.findByLabelText('Password'); submit();
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Please sign in.');
  expect(screen.queryByLabelText('Password')).toBeNull();
  expect(screen.queryByRole('link', { name: 'Account' })).toBeNull();
});
