import React from 'react';
import { Typewriter } from 'react-simple-typewriter';

export default function IlluciaTerminal({
  dialogue = '',
  candidatesCount = 0,
  confidence = 0,
  strategy = 'grandmaster_risk_entropy',
  difficulty = 'grandmaster',
  turnCount = 0,
}) {
  const strategyLabel =
    strategy === 'exact_match'
      ? 'Target Locked'
      : strategy === 'fallback_frequency'
      ? 'Global English Frequency'
      : difficulty === 'grandmaster'
      ? 'Shannon Risk-Entropy'
      : difficulty === 'scholar'
      ? 'Candidate Frequency'
      : 'Novice Probe';

  return (
    <div className="wordfactscontainer illucia-terminal">
      <div className="wordfactscontainerinner illucia-terminal-inner">
        <div className="terminal-header">
          <h4>ILLUCIA&apos;S NEURAL LOG</h4>
          <div className="terminal-metrics-bar">
            <span className="metric-chip">
              <b>CANDIDATES:</b> {candidatesCount.toLocaleString()}
            </span>
            <span className="metric-chip" data-testid="turn-counter">
              <b>TURN:</b> {turnCount}
            </span>
            <span className="metric-chip">
              <b>MODE:</b> {strategyLabel}
            </span>
          </div>
        </div>

        <div className="terminal-body">
          <div className="terminal-feed">
            <p className="terminal-prompt">&gt; Aurora Linguistics Processor 4486 AD</p>
            <div className="terminal-message" key={dialogue} role="status">
              <span className="terminal-caret">&gt; </span>
              {dialogue ? (
                <span className="terminal-text">{dialogue}</span>
              ) : (
                <span>Initializing quantum linguistics engine...</span>
              )}
            </div>
          </div>

          <div className="terminal-telemetry">
            <div className="telemetry-bar-label">
              <span>Entropy Confidence Matrix:</span>
              <span>{Math.round((confidence || 0) * 100)}%</span>
            </div>
            <div className="telemetry-bar-track">
              <div
                className="telemetry-bar-fill"
                style={{ width: `${Math.min(100, Math.max(5, (confidence || 0) * 100))}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
