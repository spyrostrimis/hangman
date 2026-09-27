import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
export default function Illucia() {
  const { user, status, refresh } = useAuth();
  if (status === 'loading') return <p role="status">Checking your session…</p>;
  if (status === 'error') return <div className="illucontainer"><p>Cannot check your session right now.</p><button onClick={refresh}>Try again</button></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: '/illucia' }} />;
  return <div className="illucontainer"><div className="illuheader"><h4>Coming Soon!</h4><p>Welcome, {user.username}. Illucia is preparing for your challenge.</p></div></div>;
}
