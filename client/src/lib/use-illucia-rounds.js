import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../Components/AuthProvider';
import { getRoundStatus } from './hangman-core.js';
import { LADDER_RESET } from './illucia/duel-session.js';
import { claimIlluciaRound, loadIlluciaStats, startIlluciaRound } from './illucia-rounds.js';
import { ILLUCIA_NO_POINTS } from '../../../shared/scoring-protocol.js';

// Illucia's server rounds for a page (v2 E3), shared by /illucia and /illucia-observatory: the
// ladder, the words that already paid, the open round, starting (which abandons an open round),
// claiming a win, and an expired session. `current` is the session the page shows now; a claim
// for any other is dropped.
export function useIlluciaRounds(userId, current) {
  const { updateScore, expireSession } = useAuth();
  const [ladder, setLadder] = useState(null);
  const [spent, setSpent] = useState(() => new Set());
  const [claim, setClaim] = useState(null);
  const mounted = useRef(true);
  const openRound = useRef(null); // a started round not yet claimed: the next start abandons it
  const active = useRef(null);
  active.current = current;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // The ladder and the words that already paid, so the form can warn before a word is committed.
  useEffect(() => {
    const controller = new AbortController();
    loadIlluciaStats({ signal: controller.signal }).then(stats => {
      if (stats.ladder) setLadder(stats.ladder);
      if (stats.spent) setSpent(new Set(stats.spent));
    }).catch(() => {});
    return () => controller.abort();
  }, []);

  // Starts a server round for this word. Resolves to { ticket } (null when the server could not
  // be reached: the duel is then unscored), or to null when the page should not start at all
  // (the session expired, or the page is gone).
  async function start(word, tier, experimental) {
    let ticket = null;
    try {
      ticket = await startIlluciaRound({ word, tier: tier.id, previousRoundId: openRound.current, experimental });
    } catch (error) {
      if (error.status === 401) { expireSession(userId); return null; }
    }
    if (!mounted.current) return null;
    // A new scored round abandons the open one, which resets the ladder.
    if (ticket && openRound.current && openRound.current !== ticket.roundId) setLadder(LADDER_RESET);
    openRound.current = ticket?.roundId ?? openRound.current;
    // Experimental rounds break the ladder.
    if (ticket?.experimental) setLadder(LADDER_RESET);
    setClaim(null);
    return { ticket };
  }

  async function save(session) {
    const { ticket } = session;
    setClaim({ roundId: ticket.roundId, saving: true });
    try {
      const result = await claimIlluciaRound(ticket, session.round.guesses, session.verified,
        { stillWanted: () => mounted.current && active.current === session });
      if (!result || !mounted.current) return;
      updateScore(userId, result.score);
      setLadder(result.ladder ?? LADDER_RESET);
      if (result.awarded.stump > 0 || result.reason === ILLUCIA_NO_POINTS.alreadyWon) {
        setSpent(words => new Set([...words, session.round.answer]));
      }
      if (openRound.current === ticket.roundId) openRound.current = null;
      if (active.current === session) setClaim({ roundId: ticket.roundId, saving: false, result });
    } catch (error) {
      if (!mounted.current) return;
      if (error.status === 401) expireSession(userId);
      if (active.current === session) setClaim({ roundId: ticket.roundId, saving: false,
        canRetry: !error.status || error.status >= 500 || error.status === 429 || error.status === 200,
        error: error.status === 401 ? 'Your session expired, so these points could not be saved.'
          : error.status === 409 ? 'This round can no longer earn points.'
            : 'Could not confirm your points were saved. Retrying is safe.' });
    }
  }

  // The round is over: a win is claimed (call once per round; a repeated claim would get the
  // stored award back); her win resets the ladder. Unscored and experimental rounds do nothing.
  function finish(session) {
    if (!session.ticket || session.experimental) return;
    if (getRoundStatus(session.round) === 'solved') setLadder(LADDER_RESET);
    else void save(session);
  }

  return {
    ladder, spent, start, finish,
    retry: session => save(session),
    // Leaving a scored round before it is over abandons it.
    abandon: () => setLadder(LADDER_RESET),
    // The claim of this session's round, if it is the latest one.
    claimFor: session => (session && claim?.roundId === session.ticket?.roundId ? claim : null),
  };
}
