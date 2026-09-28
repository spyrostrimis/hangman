import React from 'react';
import { Link } from 'react-router-dom';
import illucia from '../Images/illucia.webp';
import './RegisteredOnly.css';

// What guests see on the Illucia pages, as in the 2023 page: a notice, not
// a redirect to the sign-in form. The links return the player here afterwards.
export default function RegisteredOnly({ from }) {
  return <div className="registered-only">
    <img src={illucia} width={272} height={560} alt="Illucia, a white robot with green eyes, thinking with a finger on her cheek" />
    <section className="hm-screen">
      <div className="hm-screen-inner">
        <h1>Illucia</h1>
        <p className="registered-only-note">
          Only for <Link to="/login" state={{ from }}>registered</Link> players
        </p>
        <p className="registered-only-help">
          <Link to="/login" state={{ from }}>Sign in</Link> or <Link to="/signup" state={{ from }}>create an account</Link> to challenge her.
        </p>
      </div>
    </section>
  </div>;
}
