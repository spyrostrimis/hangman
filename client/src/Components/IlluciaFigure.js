import React from 'react';
import illucia from '../Images/illucia.webp';

// Illucia, Han Fastolfe's daughter. Her chest core and posture show her mood.
// mood: idle | happy | worried | triumphant | impressed
export default function IlluciaFigure({ mood = 'idle', thinking = false, turn = 0 }) {
  return <div className={`illucia-figure mood-${mood} ${thinking ? 'is-thinking' : ''}`}>
    {/* key restarts the reaction animation on every turn */}
    <div className="illucia-body" key={turn}>
      <img src={illucia} width={272} height={560} alt="Illucia, a white robot with green eyes, thinking with a finger on her cheek" />
      <span className="illucia-core" aria-hidden="true" />
      <span className="illucia-ear" aria-hidden="true" />
    </div>
  </div>;
}
