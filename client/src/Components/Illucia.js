import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import Word from './Word';
import IlluciaSetup from './IlluciaSetup';
import IlluciaFigure from './IlluciaFigure';
import IlluciaTerminal from './IlluciaTerminal';
import IlluciaDeck from './IlluciaDeck';
import { createGameState, applyGuess } from '../lib/hangman-core.js';
import { isValidWord, getWordsOfLength } from '../lib/dictionary.js';
import { chooseNextGuess, filterCandidates } from '../lib/illucia-solver.js';
import { getIlluciaDialogue } from '../lib/illucia-dialogue.js';

export default function Illucia() {
  const { user, status, refresh } = useAuth();

  const [phase, setPhase] = useState('setup'); // 'setup' | 'duel'
  const [gameState, setGameState] = useState(null);
  const [difficulty, setDifficulty] = useState('grandmaster');
  const [lastGuess, setLastGuess] = useState(null);
  const [dialogue, setDialogue] = useState('');
  const [candidatesCount, setCandidatesCount] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const autoPlayTimerRef = useRef(null);

  // Clear auto-play timer on unmount
  useEffect(() => {
    return () => {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
      }
    };
  }, []);

  const handleStartGame = ({ secretWord, difficulty: chosenDifficulty }) => {
    const initialState = createGameState(secretWord);
    const lengthCandidates = getWordsOfLength(initialState.wordLength);

    setGameState(initialState);
    setDifficulty(chosenDifficulty);
    setLastGuess(null);
    setAutoPlay(false);
    setIsProcessing(false);
    setCandidatesCount(lengthCandidates.length);

    setDialogue(
      getIlluciaDialogue({
        event: 'start',
        wordLength: initialState.wordLength,
        username: user?.username,
      })
    );

    setPhase('duel');
  };

  const handleNextGuess = useCallback(() => {
    if (!gameState || gameState.status !== 'playing' || isProcessing) return;

    setIsProcessing(true);

    const lengthCandidates = getWordsOfLength(gameState.wordLength);
    const currentCandidates = filterCandidates(
      lengthCandidates,
      gameState.pattern,
      gameState.misses
    );

    const nextGuess = chooseNextGuess({
      pattern: gameState.pattern,
      misses: gameState.misses,
      guessedLetters: gameState.guessedLetters,
      candidates: currentCandidates,
      difficulty,
      strikesLeft: gameState.strikesLeft,
    });

    if (!nextGuess) {
      setIsProcessing(false);
      return;
    }

    const nextState = applyGuess(gameState, nextGuess.letter);
    const isHit = nextState.hits.includes(nextGuess.letter);

    const nextCandidates = filterCandidates(
      lengthCandidates,
      nextState.pattern,
      nextState.misses
    );

    setCandidatesCount(nextCandidates.length);
    setLastGuess(nextGuess);
    setGameState(nextState);

    // Compute dialogue event
    let event = isHit ? 'hit' : 'miss';
    if (nextState.status === 'won') {
      event = 'illucia_won';
    } else if (nextState.status === 'lost') {
      event = 'player_won';
    } else if (nextCandidates.length === 1) {
      event = 'single_candidate';
    } else if (nextCandidates.length > 0 && nextCandidates.length <= 5) {
      event = 'near_victory';
    }

    const occurrences = nextState.pattern.filter((c) => c === nextGuess.letter).length;

    setDialogue(
      getIlluciaDialogue({
        event,
        letter: nextGuess.letter,
        occurrences,
        strikesLeft: nextState.strikesLeft,
        remainingCandidates: nextCandidates.length,
        secretWord: nextState.secretWord,
        username: user?.username,
      })
    );

    if (nextState.status !== 'playing') {
      setAutoPlay(false);
    }

    setIsProcessing(false);
  }, [gameState, isProcessing, difficulty, user?.username]);

  // Auto-play interval
  useEffect(() => {
    if (autoPlay && gameState && gameState.status === 'playing' && !isProcessing) {
      autoPlayTimerRef.current = setTimeout(() => {
        handleNextGuess();
      }, 1400);
    } else {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
      }
    }

    return () => {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
      }
    };
  }, [autoPlay, gameState, isProcessing, handleNextGuess]);

  const handleToggleAutoPlay = () => {
    setAutoPlay((prev) => !prev);
  };

  const handleForfeit = () => {
    if (!gameState || gameState.status !== 'playing') return;
    setGameState((prev) => ({
      ...prev,
      status: 'lost',
      strikesLeft: 0,
    }));
    setAutoPlay(false);
    setDialogue(
      `Word revealed: '${gameState.secretWord}'. Duel ended by player.`
    );
  };

  const handlePlayAgain = () => {
    setPhase('setup');
    setGameState(null);
    setLastGuess(null);
    setAutoPlay(false);
  };

  if (status === 'loading') return <p role="status">Checking your session…</p>;
  if (status === 'error') {
    return (
      <div className="illucontainer">
        <p>Cannot check your session right now.</p>
        <button onClick={refresh}>Try again</button>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: '/illucia' }} />;

  return (
    <div className="illucontainer-wrapper">
      <div style={{ display: 'none' }}>
        <h4>Coming Soon!</h4>
      </div>

      {phase === 'setup' ? (
        <IlluciaSetup
          onStartGame={handleStartGame}
          isValidWordFn={isValidWord}
          username={user.username}
        />
      ) : (
        <div className="illucia-stage-container">
          <div className="figurefacts illucia-stage">
            <IlluciaFigure
              strikesLeft={gameState.strikesLeft}
              lastGuess={lastGuess}
              isWon={gameState.status === 'won'}
              isLost={gameState.status === 'lost'}
            />
            <IlluciaTerminal
              dialogue={dialogue}
              candidatesCount={candidatesCount}
              confidence={lastGuess?.confidence}
              strategy={lastGuess?.strategy}
              difficulty={difficulty}
              turnCount={gameState.guessedLetters.length}
            />
          </div>

          <Word
            wordToFind={gameState.secretWord}
            chosenLetters={gameState.guessedLetters}
            Winner={gameState.status === 'won'}
            reveal={gameState.status === 'lost'}
          />

          <div
            style={{
              alignSelf: 'stretch',
              marginLeft: '10px',
              marginRight: '10px',
            }}
          >
            <IlluciaDeck
              hits={gameState.hits}
              misses={gameState.misses}
              onNextGuess={handleNextGuess}
              autoPlay={autoPlay}
              onToggleAutoPlay={handleToggleAutoPlay}
              onForfeit={handleForfeit}
              Winner={gameState.status === 'won'}
              Loser={gameState.status === 'lost'}
              onPlayAgain={handlePlayAgain}
              secretWord={gameState.secretWord}
              turnCount={gameState.guessedLetters.length}
              strikesLeft={gameState.strikesLeft}
              isProcessing={isProcessing}
            />
          </div>
        </div>
      )}
    </div>
  );
}
