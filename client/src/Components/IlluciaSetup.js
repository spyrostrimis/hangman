import React, { useState } from 'react';
import manifest from '../data/words.json';
import { selectRandomWord } from '../lib/word-data.js';

export default function IlluciaSetup({
  onStartGame,
  isValidWordFn,
  username = 'Challenger',
}) {
  const [inputWord, setInputWord] = useState('');
  const [maskWord, setMaskWord] = useState(false);
  const [difficulty, setDifficulty] = useState('grandmaster');

  const cleanWord = inputWord.trim().toUpperCase();
  const hasOnlyLetters = /^[A-Z]*$/.test(cleanWord);
  const isCorrectLength = cleanWord.length >= 3 && cleanWord.length <= 12;
  const isLexiconValid = isCorrectLength && hasOnlyLetters && isValidWordFn(cleanWord);

  let validationMessage = '';
  let validationClass = 'neutral';

  if (cleanWord.length === 0) {
    validationMessage = 'Enter a secret 3–12 letter English word.';
  } else if (!hasOnlyLetters) {
    validationMessage = 'English letters A–Z only (no spaces, numbers, or symbols).';
    validationClass = 'invalid';
  } else if (cleanWord.length < 3) {
    validationMessage = 'Word too short (minimum 3 letters).';
    validationClass = 'invalid';
  } else if (cleanWord.length > 12) {
    validationMessage = 'Word too long (maximum 12 letters).';
    validationClass = 'invalid';
  } else if (!isLexiconValid) {
    validationMessage = 'Word not recognized in ENABLE1 linguistics database.';
    validationClass = 'invalid';
  } else {
    validationMessage = 'Word confirmed in Aurora database. Ready to duel!';
    validationClass = 'valid';
  }

  const handleRandomize = () => {
    const randomRecord = selectRandomWord(manifest.words);
    setInputWord(randomRecord.word.toUpperCase());
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isLexiconValid) return;
    onStartGame({
      secretWord: cleanWord,
      difficulty,
    });
  };

  return (
    <div className="illucontainer illucia-setup-container">
      <div className="illuheader">
        <h1 className="illucia-title">CHALLENGE ILLUCIA</h1>
        <p className="illucia-subtitle">
          Welcome, <b>{username}</b>. Set a secret English word and test the Aurora linguistics matrix.
        </p>
      </div>

      <form className="illucia-setup-form" onSubmit={handleSubmit}>
        <div className="setup-field-group">
          <label htmlFor="secret-word-input" className="setup-label">
            YOUR SECRET WORD:
          </label>
          <div className="input-with-tools">
            <input
              id="secret-word-input"
              type={maskWord ? 'password' : 'text'}
              autoComplete="off"
              autoFocus
              value={inputWord}
              onChange={(e) => setInputWord(e.target.value.toUpperCase())}
              placeholder="e.g. ESCAPE"
              maxLength={12}
            />
            <button
              type="button"
              className="toggle-mask-btn"
              onClick={() => setMaskWord(!maskWord)}
              title={maskWord ? 'Show word' : 'Hide word'}
            >
              {maskWord ? '👁 SHOW' : '🔒 HIDE'}
            </button>
            <button
              type="button"
              className="random-word-btn"
              onClick={handleRandomize}
              title="Pick a random valid word from the game manifest"
            >
              🎲 SURPRISE ME
            </button>
          </div>
          <div className={`validation-indicator ${validationClass}`}>
            <span className="indicator-symbol">
              {validationClass === 'valid' ? '✓' : validationClass === 'invalid' ? '✕' : 'ℹ'}
            </span>
            <span>{validationMessage}</span>
          </div>
        </div>

        <div className="setup-field-group difficulty-group">
          <label className="setup-label">NEURAL DIFFICULTY MATRIX:</label>
          <div className="difficulty-pills" role="radiogroup" aria-label="Difficulty selection">
            <button
              type="button"
              className={`pill-btn ${difficulty === 'novice' ? 'selected' : ''}`}
              onClick={() => setDifficulty('novice')}
              role="radio"
              aria-checked={difficulty === 'novice'}
            >
              <b>NOVICE</b>
              <small>Phonetic Probe (~60%)</small>
            </button>

            <button
              type="button"
              className={`pill-btn ${difficulty === 'scholar' ? 'selected' : ''}`}
              onClick={() => setDifficulty('scholar')}
              role="radio"
              aria-checked={difficulty === 'scholar'}
            >
              <b>SCHOLAR</b>
              <small>Candidate Frequency (~84%)</small>
            </button>

            <button
              type="button"
              className={`pill-btn ${difficulty === 'grandmaster' ? 'selected' : ''}`}
              onClick={() => setDifficulty('grandmaster')}
              role="radio"
              aria-checked={difficulty === 'grandmaster'}
            >
              <b>GRANDMASTER</b>
              <small>Risk-Weighted Entropy (~94%)</small>
            </button>
          </div>
        </div>

        <div className="setup-actions">
          <button
            type="submit"
            id="start-duel-btn"
            className="start-duel-btn"
            disabled={!isLexiconValid}
          >
            INITIALIZE DUEL ❯
          </button>
        </div>
      </form>
    </div>
  );
}
