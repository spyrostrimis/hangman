import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const KEYS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
];

export default function IlluciaDeck({
  hits = [],
  misses = [],
  onNextGuess,
  autoPlay = false,
  onToggleAutoPlay,
  onForfeit,
  Winner = false,
  Loser = false,
  onPlayAgain,
  secretWord = '',
  turnCount = 0,
  strikesLeft = 6,
  isProcessing = false,
}) {
  const [isFlipped, setIsFlipped] = useState(false);
  const navigate = useNavigate();

  const isGameOver = Winner || Loser;

  useEffect(() => {
    let delayTimeout;
    if (isGameOver) {
      delayTimeout = setTimeout(() => {
        setIsFlipped(true);
      }, 1600);
    } else {
      setIsFlipped(false);
    }
    return () => clearTimeout(delayTimeout);
  }, [isGameOver]);

  const handleNavigate = () => {
    navigate('/hall-of-fame');
  };

  return (
    <div className={`keyboardcontainer illucia-deck ${isFlipped ? 'flipped' : ''}`}>
      <div className="keyboardcontainer-inner">
        <div className="keyboard-front">
          <div className="keyboardhints illucia-deck-controls">
            <button
              id="illucia-next-btn"
              className="deck-action-btn"
              onClick={onNextGuess}
              disabled={isGameOver || autoPlay || isProcessing}
              title="Prompt Illucia to guess the next letter"
            >
              {isProcessing ? 'CALCULATING…' : 'NEXT GUESS ❯'}
            </button>

            <button
              id="illucia-auto-btn"
              className={`deck-action-btn ${autoPlay ? 'active-autoplay' : ''}`}
              onClick={onToggleAutoPlay}
              disabled={isGameOver}
              title="Automatically run Illucia turns every 1.5 seconds"
            >
              {autoPlay ? '⏸ PAUSE AUTO' : '▶ AUTO-PLAY'}
            </button>

            <button
              id="illucia-forfeit-btn"
              className="deck-action-btn forfeit"
              onClick={onForfeit}
              disabled={isGameOver}
              title="End duel and reveal answer"
            >
              REVEAL WORD
            </button>
          </div>

          <div className="keyboard illucia-letter-matrix">
            {KEYS.map((key) => {
              const isHit = hits.includes(key);
              const isMiss = misses.includes(key);

              return (
                <button
                  key={key}
                  type="button"
                  className={`keyboardbtn ${isHit ? 'active' : ''} ${isMiss ? 'inactive' : ''}`}
                  disabled={true}
                  aria-label={`Letter ${key}: ${isHit ? 'Hit' : isMiss ? 'Miss' : 'Unused'}`}
                >
                  {key}
                </button>
              );
            })}
          </div>
        </div>

        <div className="keyboard-back">
          <div className="keyboardreplay illucia-replay-deck">
            <div className="illucia-end-summary">
              <h4>{Winner ? 'ILLUCIA DEDUCED THE WORD!' : 'HUMAN VICTORY! ILLUCIA DEPLETED'}</h4>
              <p>
                Word: <b>{secretWord}</b> · Turns: <b>{turnCount}</b> · Strikes Consumed: <b>{6 - strikesLeft} / 6</b>
              </p>
            </div>
            <div className="illucia-replay-actions">
              <button id="playagain" onClick={onPlayAgain}>
                Challenge Again!
              </button>
              <button id="checkscore" onClick={handleNavigate}>
                View Hall of Fame
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
