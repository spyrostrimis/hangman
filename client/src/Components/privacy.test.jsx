import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Privacy from './Privacy';
import Navbar from './Navbar';
import AccountForm from './AccountForm';
import { useAuth } from './AuthProvider';

vi.mock('./AuthProvider', () => ({ useAuth: vi.fn() }));
afterEach(cleanup);
const mount = (element, path = '/') => render(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>);

it('links the privacy page from the nav for guests and signed-in players alike', () => {
  vi.mocked(useAuth).mockReturnValue({ user: null, status: 'guest' });
  mount(<Navbar />, '/privacy');
  expect(screen.getByRole('link', { name: 'Privacy' }).getAttribute('aria-current')).toBe('page');
  cleanup();
  vi.mocked(useAuth).mockReturnValue({ user: { id: 'p', username: 'Player', score: 0 }, status: 'authenticated' });
  mount(<Navbar />, '/hangman');
  expect(screen.getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('/privacy');
  expect(screen.getByRole('link', { name: 'Privacy' }).getAttribute('aria-current')).toBeNull();
});

it('tells new players at signup that their username is public, with a privacy link; sign-in does not', () => {
  vi.mocked(useAuth).mockReturnValue({ user: null, status: 'guest' });
  mount(<AccountForm signup />, '/signup');
  expect(screen.getByText(/Your username is shown publicly in the Hall of Fame/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('/privacy');
  cleanup();
  mount(<AccountForm />, '/login');
  expect(screen.queryByText(/shown publicly/)).toBeNull();
  expect(screen.queryByRole('link', { name: 'Privacy' })).toBeNull();
});

it('covers the facts the code relies on: cookies, retention, deletion and the complaint route', () => {
  mount(<Privacy />, '/privacy');
  const text = document.body.textContent;
  for (const fact of ['__Host-hangman_session', '__cf_bm', 'cf_clearance', 'media.merriam-webster.com',
    'Guest play creates no account data', 'never sent to the server', 'up to 3 days', 'up to 7 days', 'about 24 hours']) {
    expect(text).toContain(fact);
  }
  expect(text).not.toMatch(/GDPR compliant/i);
  expect(screen.getByRole('link', { name: 'Account' }).getAttribute('href')).toBe('/account');
  expect(screen.getByRole('link', { name: /Hellenic Data Protection Authority/ }).getAttribute('href'))
    .toBe('https://www.dpa.gr/en/individuals/complaint-to-the-hellenic-dpa');
});
