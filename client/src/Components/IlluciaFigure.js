import React from 'react';

const MAX_STRIKES = 6;

export default function IlluciaFigure({
  strikesLeft = MAX_STRIKES,
  lastGuess = null,
  isWon = false,
  isLost = false,
}) {
  const missesCount = Math.max(0, Math.min(MAX_STRIKES, MAX_STRIKES - strikesLeft));

  return (
    <div className="figurecontainer illucia-figure">
      <div className="figurescreen illucia-screen">
        <div className="figurescreeninner illucia-screen-inner">
          <div className="illucia-hud-header">
            <span className="hud-badge">AURORA CORE</span>
            <span className="hud-status">
              {isWon ? 'TARGET RESOLVED' : isLost ? 'CORE DEPLETED' : 'CALCULATING'}
            </span>
          </div>

          <div className="illucia-guess-spotlight">
            {isWon ? (
              <div className="illucia-result-display victory">
                <h3>VICTORY</h3>
                <p>Lexical matrix solved</p>
              </div>
            ) : isLost ? (
              <div className="illucia-result-display defeat">
                <h3>OVERLOAD</h3>
                <p>6 strikes reached</p>
              </div>
            ) : lastGuess ? (
              <div className="illucia-current-guess">
                <span className="guess-label">ILLUCIA GUESSES:</span>
                <span className="guess-letter-orb">{lastGuess.letter}</span>
              </div>
            ) : (
              <div className="illucia-current-guess idle">
                <span className="guess-label">AWAITING FIRST TURN</span>
                <span className="guess-letter-orb pulse">?</span>
              </div>
            )}
          </div>

          <div className="illucia-core-matrix">
            <div className="core-matrix-title">
              SYNAPTIC POWER CELLS ({strikesLeft} / {MAX_STRIKES})
            </div>
            <div className="core-nodes-row" role="progressbar" aria-valuenow={strikesLeft} aria-valuemin={0} aria-valuemax={MAX_STRIKES}>
              {Array.from({ length: MAX_STRIKES }).map((_, index) => {
                const isDepleted = index < missesCount;
                return (
                  <div
                    key={index}
                    className={`core-node ${isDepleted ? 'depleted' : 'active'}`}
                    title={isDepleted ? `Strike ${index + 1}` : `Core Cell ${index + 1}`}
                  >
                    {isDepleted ? '✕' : '●'}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="illucia-avatar-pod">
        <div className="illucia-holo-emitter">
          <div className="holo-ring"></div>
          <div className="holo-text">ILLUCIA v4.4 · AURORA</div>
        </div>
      </div>
    </div>
  );
}
