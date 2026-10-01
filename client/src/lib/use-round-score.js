import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../Components/AuthProvider';
import { apiRequest } from './api.js';
import { getRoundStatus } from './hangman-core.js';
import { ROUND_TOO_EARLY } from '../../../shared/scoring-protocol.js';

export function useRoundScore(ticket, round) {
  const { user, expireSession, updateScore } = useAuth();
  const attempted = useRef(new WeakSet());
  const activeTicket = useRef(ticket);
  activeTicket.current = ticket;
  const activeUser = useRef(user?.id);
  activeUser.current = user?.id;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const pending = useRef(new WeakSet());
  const [result, setResult] = useState({ ticket: null, message: '', saving: false, canRetry: false });
  const won = round && getRoundStatus(round) === 'solved';
  const save = useCallback(async () => {
    if (!ticket || !won || ticket.userId !== user?.id || pending.current.has(ticket)) return;
    attempted.current.add(ticket);
    pending.current.add(ticket);
    setResult({ ticket, message: 'Saving…', saving: true, canRetry: false });
    try {
      let waitMs = Math.max(0, ticket.claimNotBefore - performance.now());
      let score;
      for (;;) {
        if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
        // A delayed claim must not be sent from a different account or page.
        if (!mounted.current || activeTicket.current !== ticket || activeUser.current !== ticket.userId) {
          attempted.current.delete(ticket);
          if (mounted.current && activeTicket.current === ticket) setResult({ ticket,
            message: 'Sign in to the same account to retry saving this round.', saving: false, canRetry: true });
          return;
        }
        try {
          ({ score } = await apiRequest('/user/round/claim', {
            method: 'POST', body: { roundId: ticket.roundId, guesses: round.guesses },
          }));
          break;
        } catch (error) {
          if (error.code !== ROUND_TOO_EARLY || !Number.isFinite(error.retryAfterMs) || error.retryAfterMs <= 0) throw error;
          // Clock skew or an early timer is a wait, never a player-facing error.
          waitMs = error.retryAfterMs;
        }
      }
      if (!Number.isSafeInteger(score) || score < 0) throw new Error('Invalid score response');
      updateScore(ticket.userId, score);
      if (activeTicket.current === ticket) setResult({ ticket, message: `100 points saved! Your total is ${score}.`, saving: false, canRetry: false });
    } catch (error) {
      if (error.status === 401) expireSession(ticket.userId);
      if (activeTicket.current === ticket) setResult({
        ticket, saving: false, canRetry: !error.status || error.status >= 500 || error.status === 200 || error.status === 429,
        message: error.status === 401
          ? 'Your session expired. These points could not be confirmed. Please sign in for your next game.'
          : error.status === 409 ? 'This round is no longer eligible for points. You can keep playing.'
            : error.status === 400 ? 'The score service could not validate this round.'
              : 'Could not confirm your score was saved. Retry safely or check the Hall of Fame.',
      });
    } finally { pending.current.delete(ticket); }
  }, [ticket, round, won, user?.id, expireSession, updateScore]);

  useEffect(() => {
    if (ticket && won && !attempted.current.has(ticket)) void save();
  }, [ticket, won, save]);

  return {
    ...(result.ticket === ticket ? result : { message: '', saving: false, canRetry: false }),
    saving: result.ticket === ticket && ticket?.userId === user?.id && result.saving,
    canRetry: result.ticket === ticket && result.canRetry && ticket?.userId === user?.id,
    retry: save,
  };
}
