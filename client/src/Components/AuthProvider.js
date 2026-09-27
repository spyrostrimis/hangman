import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');
  const generation = useRef(0);
  const currentUser = useRef(user);
  currentUser.current = user;
  const acceptUser = useCallback(value => {
    generation.current++;
    setUser(value);
    setStatus(value ? 'authenticated' : 'guest');
  }, []);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      const result = await apiRequest('/user/me');
      if (current === generation.current) { setUser(result.user); setStatus('authenticated'); }
    } catch (error) {
      if (current === generation.current) { setUser(null); setStatus(error.status === 401 ? 'guest' : 'error'); }
    }
  }, []);
  useEffect(() => {
    try { localStorage.removeItem('token'); } catch { /* Storage can be disabled. */ }
    void refresh();
    const focus = () => { void refresh(); };
    window.addEventListener('focus', focus);
    return () => { generation.current++; window.removeEventListener('focus', focus); };
  }, [refresh]);
  const logout = async () => {
    await apiRequest('/user/logout', { method: 'POST' });
    acceptUser(null);
  };
  const updateScore = useCallback((id, score) => {
    setUser(current => current?.id === id ? { ...current, score: Math.max(current.score, score) } : current);
  }, []);
  const expireSession = useCallback(id => {
    // A later login must not be cleared by an earlier round's failed request.
    if (currentUser.current?.id === id) acceptUser(null);
  }, [acceptUser]);
  return <AuthContext.Provider value={{ user, status, acceptUser, refresh, logout, updateScore, expireSession }}>{children}</AuthContext.Provider>;
}
