import React from 'react'
import { useEffect, useState } from "react";
import { loadLeaderboard } from '../lib/leaderboard.js';
import { useAuth } from './AuthProvider';
import { Link } from "react-router-dom";
import './Halloffame.css';

// Arcade-style places: equal scores share a place (1st, 2nd, 2nd, 4th).
export function rankScores(users) {
  return users.map(entry => ({ ...entry, rank: 1 + users.filter(other => other.score > entry.score).length }));
}

export function ordinal(value) {
  const tens = value % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[value % 10] || 'th');
  return `${value}${suffix}`;
}

const Halloffame = () => {
  const [allusers, setAllusers] = useState([]);
  const [status, setStatus] = useState('loading');
  const { user, status: authStatus } = useAuth();

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    loadLeaderboard(controller.signal).then(users => {
      if (controller.signal.aborted) return;
      setAllusers(users);
      setStatus(users.length ? 'ready' : 'empty');
    }).catch(() => {
      if (!controller.signal.aborted) setStatus('error');
    });
    return () => controller.abort();
  }, []);

  const ranked = rankScores(allusers);
  const mine = user && ranked.find(entry => entry.username === user.username);

  return (
    <div className="hall hall-of-fame">
      <header className="hall-heading">
        <h1 className="hm-title">Hall of Fame</h1>
        <p className="hm-subtitle">Every rescue in Play Hangman earns 100 points</p>
      </header>

      {!user && authStatus !== 'loading' && (
        <p className="hall-invite">
          Let's get competitive! <Link to="/login" state={{ from: '/hall-of-fame' }}>Sign in</Link> or{" "}
          <Link to="/signup" state={{ from: '/hall-of-fame' }}>sign up</Link> to earn points with each win and claim your place.
        </p>
      )}

      <div className="hall-board">
        {mine && status === 'ready' && (
          <p className="hall-you">You are <strong>{ordinal(mine.rank)}</strong> with <strong>{mine.score.toLocaleString('en-US')}</strong> points.</p>
        )}
        <div className='halltable' aria-busy={status === 'loading'}>
          <div aria-live="polite" aria-atomic="true">
            {status !== 'ready' && (
              <div className="hall-status">
                {status === 'loading' && <p>Loading scores…</p>}
                {status === 'empty' && <p>No scores yet.</p>}
                {status === 'error' && (
                  <p>Scores are unavailable right now. Please try again later.</p>
                )}
              </div>
            )}
          </div>
          {status === 'ready' && (
            <table id="highscores">
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Player</th>
                  <th scope="col">Score</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(entry => {
                  const isMe = mine?.username === entry.username;
                  const place = entry.rank <= 3 ? `place-${entry.rank}` : '';
                  return (
                    <tr key={entry.username} className={`${place} ${isMe ? 'is-me' : ''}`} aria-current={isMe ? 'true' : undefined}>
                      <td>{ordinal(entry.rank)}</td>
                      <td>
                        <span className="hall-name">{entry.username}</span>
                        {isMe && <span className="hall-you-tag">You</span>}
                      </td>
                      <td>{entry.score.toLocaleString('en-US')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default Halloffame
