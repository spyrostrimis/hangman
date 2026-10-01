import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../Components/AuthProvider';
import manifest from '../data/words.json';
import { apiRequest } from './api.js';
import { applyGuess, createRound } from './hangman-core.js';
import { selectRandomWord } from './word-data.js';
import { MIN_ROUND_DURATION_MS } from '../../../shared/scoring-protocol.js';

const empty = { selectedWord: null, round: null, ticket: null, note: '', loading: false };

export function useHangmanRound(enabled) {
  const auth = useAuth();
  const currentAuth = useRef(auth);
  currentAuth.current = auth;
  const [game, setGame] = useState(empty);
  const currentGame = useRef(game);
  currentGame.current = game;
  const generation = useRef(0);
  const authLoading = auth.status === 'loading';

  const startRound = useCallback(async () => {
    const current = ++generation.current;
    const previous = currentGame.current;
    const userId = currentAuth.current.user?.id;
    const localRound = (note = '') => {
      let record = selectRandomWord(manifest.words);
      for (let attempt = 0; attempt < 3 && record === previous.selectedWord; attempt++) record = selectRandomWord(manifest.words);
      setGame({ selectedWord: record, round: createRound(record.word), ticket: null, note, loading: false, roundKey: current });
    };
    if (!userId) {
      localRound(currentAuth.current.status === 'error' ? 'Score service unavailable. This round is unranked; you can still play.' : '');
      return;
    }
    setGame({ ...empty, loading: true, note: 'Preparing your scored round…' });
    try {
      const ticket = await apiRequest('/user/round/start', {
        method: 'POST',
        body: previous.ticket?.userId === userId ? { previousRoundId: previous.ticket.roundId } : {},
      });
      if (current !== generation.current) return;
      if (currentAuth.current.user?.id !== userId) { localRound('This round is unranked. Sign in before starting your next game to earn points.'); return; }
      const record = manifest.words.find(record => record.word === ticket.word);
      if (!record || typeof ticket.roundId !== 'string' || !Number.isFinite(ticket.expiresAt)
        || !Number.isFinite(ticket.issuedAt) || !Number.isFinite(ticket.serverNow)) throw new Error('Invalid round');
      // Use server-relative time and a monotonic client clock, not the device's
      // wall clock. Response transit time only makes this wait conservative.
      const claimNotBefore = performance.now() + Math.max(0, ticket.issuedAt + MIN_ROUND_DURATION_MS - ticket.serverNow);
      setGame({ selectedWord: record, round: createRound(record.word), ticket: { ...ticket, userId, claimNotBefore }, note: '', loading: false, roundKey: current });
    } catch (error) {
      if (current !== generation.current) return;
      if (error.status === 401) currentAuth.current.expireSession(userId);
      localRound('Score service unavailable. This round is unranked; you can still play.');
    }
  }, []);

  useEffect(() => {
    if (enabled && !authLoading) void startRound();
    else setGame({ ...empty, loading: enabled, note: enabled ? 'Preparing your round…' : '' });
    // Late start responses must not replace a newer game or a different page.
    return () => { generation.current++; };
  }, [enabled, authLoading, startRound]);

  const guess = useCallback(letter => {
    setGame(current => current.round ? { ...current, round: applyGuess(current.round, letter) } : current);
  }, []);
  return { ...game, startRound, guess };
}
