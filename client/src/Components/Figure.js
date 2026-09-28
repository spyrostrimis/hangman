import React from "react";
import artsy from "../Images/artsy.png";
import defaultpainting from "../Images/painting.webp";
import gameover from "../Images/gameover.png";

// Artsy's pod. His screen shows his reboot progress while the round is on,
// his painting when the player wins, and the Game Over card on a loss.
const Figure = ({ painting, progress = 0, Winner = false, Loser = false }) => {
  const percent = Math.round(progress * 100);
  const artwork = Winner ? painting || defaultpainting : Loser ? gameover : null;
  return (
    <div className="figurecontainer">
      <div className="figurescreen">
        <div
          className={`figurescreeninner ${artwork ? "has-art" : ""}`}
          style={artwork ? { backgroundImage: `url(${artwork})` } : null}
        >
          {!artwork && (
            <div className="artsy-status">
              <span className="artsy-status-name">Artsy</span>
              <strong className="artsy-status-state">Offline</strong>
              <span className="hm-label" id="artsy-reboot-label">Reboot</span>
              <div className="artsy-reboot" role="progressbar" aria-labelledby="artsy-reboot-label"
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                <span style={{ width: `${percent}%` }} />
              </div>
              <span className="artsy-reboot-value">{percent}%</span>
            </div>
          )}
        </div>
      </div>
      {Winner && <p className="figure-banner">Back online</p>}
      <div className={`figureartsy ${Winner ? "winner" : ""}`}>
        <img id="wordartsyimg" src={artsy} width={288} height={250} alt="The robot Artsy" />
      </div>
    </div>
  );
};

export default Figure;
