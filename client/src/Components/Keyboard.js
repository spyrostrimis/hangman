import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import ronnyai from "../Images/ronnyai.png";
import { useAuth } from "./AuthProvider";
import { MAX_MISSES } from "../lib/hangman-core.js";

const KEYS = "abcdefghijklmnopqrstuvwxyz".split("");

const Keyboard = ({
  activeLetters,
  inactiveLetters,
  addChosenLetter,
  disabled = false,
  setInstructions,
  setHint1,
  setHint2,
  Winner,
  Loser,
  disablehint1 = false,
  disablehint2 = false,
  missesLeft = MAX_MISSES,
  onPlayAgain,
  scoreMessage = "",
  scoreSaving = false,
  onRetryScore = null,
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    let delayTimeout;

    if (Winner || Loser) {
      delayTimeout = setTimeout(() => {
        setIsFlipped(true);
      }, 2000);
    } else {
      setIsFlipped(false);
    }

    return () => clearTimeout(delayTimeout);
  }, [Winner, Loser]);

  return (
    <div className={`keyboardcontainer ${isFlipped ? "flipped" : ""}`}>
      <div className="keyboardcontainer-inner">
        <div className="keyboard-front">
          <div className="keyboardtoolbar">
            <div className="keyboardhints">
              <button id="hint1" onClick={setHint1} disabled={disablehint1 || disabled}>
                Hint 1
              </button>
              <button id="hint2" onClick={setHint2} disabled={disablehint2 || disabled}>
                Hint 2
              </button>
              <button id="tips" onClick={setInstructions} disabled={false}>
                Instructions & tips
              </button>
            </div>
            <div className="keyboardcells" role="img" aria-label={`${missesLeft} of ${MAX_MISSES} attempts left`}>
              <span className="hm-label">Attempts left</span>
              <div className="hm-cells">
                {Array.from({ length: MAX_MISSES }, (_, index) => <span key={index} className={index < missesLeft ? "on" : ""} />)}
              </div>
            </div>
          </div>
          <div className="keyboardronny">
            <img
              id="wordroonyimg"
              src={ronnyai}
              width={170}
              height={204}
              alt="Professor Han Fastolfe"
              title="Professor Han Fastolfe"
            />
          </div>
          <div className="keyboard">
            {KEYS.map((key) => {
              const isActive = activeLetters.includes(key);
              const isInactive = inactiveLetters.includes(key);
              return (
                <button
                  onClick={() => addChosenLetter(key)}
                  className={`keyboardbtn ${isActive ? "active" : ""} ${isInactive ? "inactive" : ""}`}
                  disabled={isInactive || isActive || disabled}
                  key={key}
                >
                  {key}
                </button>
              );
            })}
          </div>
        </div>
        <div className="keyboard-back">
          <div className="keyboardreplay">
            <p className="keyboard-result">{Winner ? "Artsy is back online" : "Artsy is still offline"}</p>
            {scoreMessage && <p className="keyboard-score" role="status">{scoreMessage}</p>}
            {onRetryScore && <button className="hm-button" onClick={onRetryScore}>Retry saving points</button>}
            {Winner && !user && (
              <p className="keyboard-score">
                <Link to="/login" state={{ from: "/hangman" }}>Sign in</Link> to earn 100 points for your next rescue.
              </p>
            )}
            <div className="keyboard-replay-actions">
              <button id="playagain" className="hm-button primary" disabled={scoreSaving} onClick={onPlayAgain}>
                Play again
              </button>
              <button id="checkscore" className="hm-button" onClick={() => navigate("/hall-of-fame")}>
                Hall of Fame
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Keyboard;
