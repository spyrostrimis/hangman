import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { apiRequest } from '../lib/api.js';
import { deriveCredential } from '../lib/credential.js';
import './AccountForm.css';

export default function Account() {
  const { user, status, acceptUser, expireSession } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [deleted, setDeleted] = useState(false);
  const busy = useRef(false);
  async function remove(event) {
    event.preventDefault();
    if (busy.current || !user) return;
    busy.current = true;
    setPending(true); setError('');
    const form = event.currentTarget;
    const id = user.id;
    try {
      const parameters = await apiRequest('/user/auth-params', { method: 'POST', body: { username: user.username } });
      const credential = await deriveCredential(form.elements.password.value, parameters);
      const result = await apiRequest('/user/delete-account', { method: 'POST', body: { credential } });
      if (result.ok !== true) throw new Error('Could not confirm deletion. Please try again.');
      form.elements.password.value = '';
      setDeleted(true);
      acceptUser(null);
    } catch (failure) {
      if (failure.status === 401) expireSession(id);
      setError(failure.message);
    } finally { busy.current = false; setPending(false); }
  }
  return <div className="account"><section className="account-panel-inner account-form">
    <h1>Account</h1>
    {deleted ? <p role="status">Your account has been deleted. You are signed out.</p>
      : status === 'loading' ? <p role="status">Checking session…</p>
      : !user ? <p><Link to="/login">Sign in</Link> to manage your account.</p>
      : <form onSubmit={remove} aria-busy={pending}>
        <p>Signed in as <strong>{user.username}</strong>.</p>
        <h2>Delete account</h2>
        <p id="delete-warning">Deletion is permanent. Your account, game records and Hall of Fame entry will be removed. There is no recovery.</p>
        <label htmlFor="delete-password">Password</label>
        <input id="delete-password" name="password" type="password" required maxLength={128}
          autoComplete="current-password" disabled={pending} aria-describedby="delete-warning" />
        <button className="hm-button" type="submit" disabled={pending}>{pending ? 'Deleting…' : 'Delete my account permanently'}</button>
      </form>}
    {error && <p className="account-error" role="alert">{error}</p>}
    {deleted && <p><Link to="/hangman">Play as a guest</Link></p>}
  </section></div>;
}
