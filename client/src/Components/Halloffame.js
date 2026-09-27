import React from 'react'
import { useEffect, useState } from "react";
import { loadLeaderboard } from '../lib/leaderboard.js';
import { useAuth } from './AuthProvider';
import { Link } from "react-router-dom";

const Halloffame = ({ Winner = false}) => {
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



  return (
    <div className="hallcontainer hall-of-fame">
      {!user && authStatus !== 'loading' && (
        <div className='hallheader'>
          <h4>Let's get competitive!</h4>
          <h4>
            <Link to="/login">Login</Link> or <Link to="/signup">Signup</Link>{" "}
            to earn points with each win, and claim your place into the Hall Of
            Fame.
          </h4>
        </div>
      )}
      <h1>HALL OF FAME</h1>
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
                <th style={{ textAlign: "right" }}>Rank</th>
                <th style={{ textAlign: "center", width: "480px" }}>Score</th>
                <th>Player</th>
              </tr>
            </thead>
            <tbody>
              {allusers.map((user, index) => {
                return (
                  <tr key={user.username}>
                    <td>{index + 1}</td>
                    <td>{user.score}</td>
                    <td>{user.username}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Halloffame
