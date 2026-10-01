import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import './Navbar.css';

const LINKS = [
  { to: '/', label: 'HOMEWORLD', end: true },
  { to: '/hangman', label: 'Play Hangman' },
  { to: '/illucia', label: 'Play vs AI' },
  { to: '/illucia-observatory', label: 'Illucia' },
  { to: '/hall-of-fame', label: 'Hall of Fame' },
  { to: '/privacy', label: 'Privacy' },
];

export default function Navbar() {
  const { user, status, logout } = useAuth();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  async function signOut() {
    setPending(true); setError('');
    try { await logout(); } catch (failure) { setError(failure.message); }
    finally { setPending(false); }
  }
  return <div className="navbarcustom">
    <nav aria-label="Main">
      <div className="nav-links">
        {LINKS.map(link => <NavLink key={link.to} to={link.to} end={link.end}>{link.label}</NavLink>)}
      </div>
      <div className="nav-account">
        {user ? <>
          <span className="nav-player" title={`Signed in as ${user.username}`}>
            <span className="nav-player-name">{user.username}</span>
            <span className="nav-player-score">{(user.score ?? 0).toLocaleString('en-US')} pts</span>
          </span>
          <NavLink to="/account">Account</NavLink>
          <button type="button" className="nav-logout" onClick={signOut} disabled={pending}>{pending ? 'Signing out…' : 'Logout'}</button>
        </> : status === 'loading'
          ? <span className="session-loading">Checking session…</span>
          : <NavLink to="/login">Sign In</NavLink>}
      </div>
    </nav>
    {error && <p role="alert" className="account-error">{error}</p>}
  </div>;
}
