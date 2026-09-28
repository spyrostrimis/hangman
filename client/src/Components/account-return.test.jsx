import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './AuthProvider';
import AccountForm from './AccountForm';
import { apiRequest, ApiError } from '../lib/api.js';
import { deriveCredential } from '../lib/credential.js';

vi.mock('../lib/api.js', async original => ({ ...await original(), apiRequest: vi.fn() }));
vi.mock('../lib/credential.js', () => ({ deriveCredential: vi.fn(), registrationParameters: vi.fn() }));
beforeEach(() => {
  vi.mocked(deriveCredential).mockResolvedValue('cd'.repeat(32));
  vi.mocked(apiRequest).mockImplementation(async path => {
    if (path === '/user/me') throw new ApiError('Guest', 401);
    if (path === '/user/auth-params') return { salt: 'ab'.repeat(16), version: 1 };
    if (path === '/user/login') return { user: { id: 'p', username: 'Player', score: 0 } };
    throw new Error(`Unexpected request: ${path}`);
  });
});
afterEach(cleanup);

async function signInFrom(from) {
  render(<MemoryRouter initialEntries={[{ pathname: '/login', state: { from } }]}><AuthProvider><Routes>
    <Route path="/login" element={<AccountForm />} />
    <Route path="/illucia-observatory" element={<p>Observatory destination</p>} />
    <Route path="/" element={<p>Home destination</p>} />
    <Route path="*" element={<p>Other destination</p>} />
  </Routes></AuthProvider></MemoryRouter>);
  const button = await screen.findByRole('button', { name: 'Sign in' });
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'Player' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a passphrase' } });
  fireEvent.submit(button.closest('form'));
}

it('returns to the Illucia Observatory after signing in from it', async () => {
  await signInFrom('/illucia-observatory');
  expect(await screen.findByText('Observatory destination')).toBeTruthy();
});

it('still sends unlisted return paths home', async () => {
  await signInFrom('/somewhere-else');
  expect(await screen.findByText('Home destination')).toBeTruthy();
});
