import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import artsy from "../Images/artsy.png";
import ronnyai from "../Images/ronnyai.png";
import illucia from "../Images/illucia.webp";
import "./Intro.css";

const CREW = [
  {
    id: "han",
    name: "Han Fastolfe",
    role: "Professor of Linguistics · Aurora",
    image: { src: ronnyai, width: 170, height: 204, alt: "The robot Professor Han Fastolfe" },
    accent: "#43e440",
    bio: <>
      <p>Han was created in <strong>Aurora</strong> in the year 4486 AD. His fascination with language and its structure led him to Earth.</p>
      <p>For his key role in the reconciliation between Robots and Humans, he was honored with the seat of <strong>Professor of Linguistics at the MIT</strong>.</p>
      <p>Han spends most of his free time with his beloved daughter <strong>Illucia</strong>.</p>
      <small>Han Fastolfe is inspired from Isaac Asimov's Robot series.</small>
    </>,
  },
  {
    id: "artsy",
    name: "Artsy",
    role: "Painter · Solaria",
    image: { src: artsy, width: 288, height: 250, alt: "The robot Artsy with his easel" },
    accent: "#e1801b",
    bio: <>
      <p>Artsy originates from the planet <strong>Solaria</strong>. Unlike most robots, he cannot speak. So he <strong>communicates through painting</strong>.</p>
      <p>His passion for creativity and artistic expression <strong>led him to Earth</strong> to explore different forms of art.</p>
      <p>One fated day, while Artsy was drawing a beautiful lake scene at Massachusetts, he met his <strong>best friend Han</strong>.</p>
      <small>Artsy is an original creation, embodying the fusion of art and AI.</small>
    </>,
  },
  {
    id: "illucia",
    name: "Illucia",
    role: "Han's daughter · Aurora",
    image: { src: illucia, width: 272, height: 560, alt: "Illucia, a white robot with green eyes, thinking with a finger on her cheek" },
    accent: "#a54ed7",
    bio: <>
      <p>Illucia is <strong>Professor Fastolfe's daughter</strong>, and she shares his love of words.</p>
      <p>She has read every dictionary on Aurora. Twice. Give her a word and she will <strong>show you her working</strong>.</p>
      <p>Think you can outwit her? <Link to="/illucia-observatory">Choose a secret word</Link> and watch her guess.</p>
    </>,
  },
];

function CrewCard({ member }) {
  const [open, setOpen] = useState(false);
  const bioId = `crew-${member.id}-bio`;
  return <article className={`home-card ${open ? "open" : ""}`} style={{ "--accent": member.accent }}>
    <div className={`home-card-pod home-card-pod-${member.id}`}>
      <img {...member.image} alt={member.image.alt} />
    </div>
    <h3>{member.name}</h3>
    <p className="home-card-role">{member.role}</p>
    <button type="button" className="home-card-toggle" aria-expanded={open} aria-controls={bioId} onClick={() => setOpen(!open)}>
      {open ? "Close file" : "Open file"}
    </button>
    <div id={bioId} className="home-card-bio" hidden={!open}>{member.bio}</div>
  </article>;
}

const Intro = () => {
  const { user, status } = useAuth();
  return (
    <div className="home">
      <header className="home-heading">
        <h1 className="hm-title">Hangman</h1>
        <p className="hm-subtitle">Rescue Mission</p>
      </header>

      <section className="hm-screen home-brief" aria-labelledby="home-brief-title">
        <div className="hm-screen-inner">
          <h2 id="home-brief-title">Mission briefing</h2>
          <p>
            Professor Han Fastolfe urgently seeks your assistance. His dear friend
            Artsy has mysteriously shut down. Only one thing can awaken Artsy from
            his slumber — <em>a secret word</em>.
          </p>
          <p>Discover it and breathe life back into Artsy.</p>
          <h3>But beware!</h3>
          <p>
            You have a limited number of <em>attempts</em>. With each incorrect
            guess, the situation becomes more precarious. Choose your letters
            wisely and pay attention to any clues provided by Professor Fastolfe
            to guide you on this <em>captivating quest</em>.
          </p>
          <div className="home-actions">
            <Link className="hm-button primary" to="/hangman">Play Hangman</Link>
            <Link className="hm-button" to="/illucia-observatory">Challenge Illucia</Link>
          </div>
          {!user && status !== "loading" && (
            <p className="home-guest">
              <Link to="/login">Sign in</Link> or <Link to="/signup">create an account</Link> to
              earn 100 points per rescue and claim your place in the Hall of Fame.
            </p>
          )}
        </div>
      </section>

      <section className="home-crew" aria-labelledby="home-crew-title">
        <h2 id="home-crew-title">The crew</h2>
        <div className="home-cards">
          {CREW.map(member => <CrewCard key={member.id} member={member} />)}
        </div>
      </section>
    </div>
  );
};

export default Intro;
