import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../Components/AuthProvider';
import { apiRequest } from './api.js';
import { createRoundScoreTracker } from './round-score.js';

export function useRoundScore(round, won) {
  const { user, expireSession, updateScore } = useAuth();
  const claim = useRef(createRoundScoreTracker());
  const activeRound = useRef(round);
  activeRound.current = round;
  const [result, setResult] = useState({ round: null, message: '' });
  useEffect(() => {
    if (!claim.current(round, won, user?.id)) return;
    const id = user.id;
    setResult({ round, message: 'Saving your 100 points…' });
    apiRequest('/user/add100', { method: 'PUT' }).then(({ score }) => {
      updateScore(id, score);
      if (activeRound.current === round) setResult({ round, message: `100 points saved! Your total is ${score}.` });
    }).catch(error => {
      if (error.status === 401) expireSession(id);
      if (activeRound.current === round) setResult({ round, message: error.status === 401
        ? 'Your session expired. These points were not saved. Please sign in for your next game.'
        : 'Could not confirm your score was saved. Check the Hall of Fame. You can keep playing.' });
    });
  }, [round, won, user?.id, expireSession, updateScore]);
  return result.round === round ? result.message : '';
}
