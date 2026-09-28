import React, { useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { apiRequest } from '../lib/api.js';
import { deriveCredential, registrationParameters } from '../lib/credential.js';
import ronnyai from '../Images/ronnyai.png';
import './AccountForm.css';

export default function AccountForm({ signup = false }) {
  const { user, status, acceptUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const from = location.state?.from;
  const destination = ['/illucia', '/illucia-observatory', '/hangman', '/hall-of-fame'].includes(from) ? from : '/';
  if (user) return <Navigate to={destination} replace />;
  // Sign-in keeps the former 35-character limit for accounts created before new names were capped at 20.
  const maxName = signup ? 20 : 35;
  async function submit(event) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true); setError('');
    const form = event.currentTarget;
    const username = form.elements.username.value.trim();
    const password = form.elements.password.value;
    try {
      if (signup && (password.length < 15 || password.length > 128)) throw new Error('Use a password or passphrase between 15 and 128 characters.');
      const parameters = signup ? registrationParameters() : await apiRequest('/user/auth-params', { method: 'POST', body: { username } });
      const credential = await deriveCredential(password, parameters);
      const result = await apiRequest(`/user/${signup ? 'signup' : 'login'}`, {
        method: 'POST', body: { username, credential, ...(signup ? { salt: parameters.salt, version: parameters.version } : {}) },
      });
      if (!result.user?.id || typeof result.user.username !== 'string') throw new Error('The account service returned an unexpected response.');
      form.elements.password.value = '';
      acceptUser(result.user);
      navigate(destination, { replace: true });
    } catch (failure) { setError(failure.message); }
    finally { busy.current = false; setPending(false); }
  }
  return <div className="account">
    <aside className="account-pod" aria-hidden="true">
      <p className="account-bubble">{signup
        ? 'Welcome aboard! Choose a name for the Hall of Fame.'
        : 'Welcome back. Artsy has been waiting for you.'}</p>
      <img src={ronnyai} width={170} height={204} alt="" />
    </aside>
    <section className="hm-screen account-screen">
      <div className="hm-screen-inner">
        <form className="account-form" onSubmit={submit} aria-busy={pending}>
          <h1>{signup ? 'Create account' : 'Sign in'}</h1>
          <label htmlFor="username">Username</label>
          <input id="username" name="username" type="text" required autoComplete="username" autoCapitalize="none"
            spellCheck={false} pattern={`[A-Za-z0-9]{3,${maxName}}`} minLength={3} maxLength={maxName} disabled={pending}
            title={`Use 3–${maxName} letters or numbers.`} aria-describedby={signup ? 'username-help' : undefined} />
          {signup && <p id="username-help" className="account-help">3–20 letters or numbers. It appears in the Hall of Fame.</p>}
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required maxLength={128} minLength={signup ? 15 : 1}
            autoComplete={signup ? 'new-password' : 'current-password'} disabled={pending} aria-describedby={signup ? 'password-help' : undefined} />
          {signup && <p id="password-help" className="account-help">Use 15–128 characters. Save your password: password recovery is not available yet.</p>}
          {error && <p className="account-error" role="alert">{error}</p>}
          <button type="submit" className="hm-button primary" disabled={pending || status === 'loading'}>{pending ? 'Please wait…' : signup ? 'Sign up' : 'Sign in'}</button>
          <p className="account-switch">{signup ? <>Already have an account? <Link to="/login" state={location.state}>Sign in</Link></> : <>New player? <Link to="/signup" state={location.state}>Create account</Link></>}</p>
        </form>
      </div>
    </section>
  </div>;
}
