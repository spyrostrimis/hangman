import React, { useEffect, useRef, useState } from 'react';
import { VOCABULARY_TIERS } from '../lib/illucia/lexicon.js';
import { loadIlluciaStats } from '../lib/illucia-rounds.js';

const top = (counts, n) => Object.entries(counts).filter(([, count]) => count > 0)
  .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n);

// The player's record against her (v2 E4): the server's stats, loaded when opened. Shared by
// /illucia (prefix "duel") and the Observatory (prefix "obs"); each page styles its own classes.
export default function IlluciaRecord({ onClose, prefix }) {
  const [state, setState] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const heading = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    loadIlluciaStats({ signal: controller.signal })
      .then(stats => setState({ status: 'ready', stats }))
      .catch(() => { if (!controller.signal.aborted) setState({ status: 'error' }); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => { heading.current?.focus(); }, []);
  const stats = state.stats;
  return <section className={`${prefix}-stats`} aria-labelledby={`${prefix}-stats-title`}>
    <div className={`${prefix}-stats-head`}>
      <h2 id={`${prefix}-stats-title`} ref={heading} tabIndex={-1}>Your record vs Illucia</h2>
      <button type="button" className={`${prefix}-new`} onClick={onClose}>Close</button>
    </div>
    {state.status === 'loading' && <p role="status">Loading your record…</p>}
    {state.status === 'error' && <p role="alert">Your record could not load. <button type="button" className={`${prefix}-new`} onClick={() => setAttempt(value => value + 1)}>Try again</button></p>}
    {state.status === 'ready' && stats.games === 0 && <p>No duels yet. Set her a word.</p>}
    {state.status === 'ready' && stats.games > 0 && <>
      <p className={`${prefix}-stats-total`}><b>{stats.games}</b> {stats.games === 1 ? 'duel' : 'duels'} · you won <b>{stats.wins}</b> · she won or you left <b>{stats.lostOrAbandoned}</b></p>
      <table className={`${prefix}-stats-tiers`}>
        <thead><tr><th scope="col">Level</th><th scope="col">Duels</th><th scope="col">You won</th></tr></thead>
        <tbody>{VOCABULARY_TIERS.map(tier => <tr key={tier.id}>
          <th scope="row">{tier.label}</th><td>{stats.tiers?.[tier.id]?.games ?? 0}</td><td>{stats.tiers?.[tier.id]?.wins ?? 0}</td>
        </tr>)}</tbody>
      </table>
      <h3>Words she learned from you</h3>
      {stats.learned?.total > 0
        ? <p>{stats.learned.recent.slice(0, 12).map(word => word.toUpperCase()).join(' · ')}
          {stats.learned.total > 12 ? ` · and ${stats.learned.total - 12} more` : ''}</p>
        : <p className={`${prefix}-muted`}>None yet: beat her, and she remembers the word at every level.</p>}
      <h3>Your favourites</h3>
      <p>Lengths: {top(stats.history?.lengths ?? {}, 3).map(([length, count]) => `${length} letters (${count})`).join(' · ') || '—'}</p>
      <p>Letters: {top(stats.history?.letters ?? {}, 5).map(([letter]) => letter.toUpperCase()).join(' · ') || '—'}</p>
      <p className={`${prefix}-muted`}>Duels in experimental mode are not counted.</p>
    </>}
  </section>;
}
