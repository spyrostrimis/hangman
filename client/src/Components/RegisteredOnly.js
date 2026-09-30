import React from 'react';
import { Link } from 'react-router-dom';
import './RegisteredOnly.css';

// What guests see on the Illucia pages, as in the 2023 page: words on the
// space background, not a redirect to the sign-in form. Illucia herself is
// only shown to registered players. The links return the player here.
export default function RegisteredOnly({ from }) {
  return <div className="registered-only">
    <h1 className="hm-title">Illucia</h1>
    <p className="registered-only-note">
      Only for <Link to="/login" state={{ from }}>registered</Link> players
    </p>
    <p className="registered-only-pitch">You choose the word. She guesses the letters.</p>
    <p className="registered-only-help">
      <Link to="/login" state={{ from }}>Sign in</Link> or <Link to="/signup" state={{ from }}>create an account</Link> to challenge her.
    </p>
  </div>;
}
