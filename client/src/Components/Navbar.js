import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthProvider';
export default function Navbar() {
  const { user, status, logout } = useAuth();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  async function signOut() {
    setPending(true); setError('');
    try { await logout(); } catch (failure) { setError(failure.message); }
    finally { setPending(false); }
  }
  return <div className="navbarcustom"><nav>
    <Link to="/">HOMEWORLD</Link>
    <Link to="/hangman">Play Hangman</Link>
    <Link to="/illucia">Play vs AI</Link>
    <Link to="/hall-of-fame">Hall of Fame</Link>
    {user ? <button className="nav-logout" onClick={signOut} disabled={pending}>{pending ? 'Signing out…' : 'Logout'}</button>
      : status === 'loading' ? <span className="session-loading">Checking session…</span> : <Link to="/login">Sign In</Link>}
  </nav>{error && <p role="alert" className="account-error">{error}</p>}</div>;
}
