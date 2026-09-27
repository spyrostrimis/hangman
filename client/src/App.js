import './App.css';
import PageBackground from './Components/PageBackground';
import { getPageArt, prefetchLinkArt } from './lib/page-art.js';
import Navbar from './Components/Navbar';
import Intro from './Components/Intro';
import Signup from "./Components/Signup";
import Login from "./Components/Login";
import Header from './Components/Header';
import Figure from './Components/Figure';
import Word from "./Components/Word";
import Wordfacts from './Components/Wordfacts';
import Keyboard from "./Components/Keyboard";
import Illucia from './Components/Illucia';
import Halloffame from "./Components/Halloffame";
import Footer from './Components/Footer';
import soundbtn from "./Images/soundbtn.png";
import mwLogo from "./Images/mw-logo-dark-background.png";
import manifest from "./data/words.json";
import { buildAssetUrl, selectRandomWord } from "./lib/word-data.js";
import { useRoundScore } from './lib/use-round-score.js';
import {
  applyGuess,
  createRound,
  getCorrectGuesses,
  getIncorrectGuesses,
  getLastGuess,
  getRemainingMisses,
  getRoundStatus,
} from './lib/hangman-core.js';

import { useCallback, useEffect, useReducer, useState } from "react";
import { Route, Routes, Navigate, useLocation } from "react-router-dom";

function roundReducer(round, action) {
  if (action.type === 'start') return createRound(action.answer);
  if (action.type === 'guess') return round ? applyGuess(round, action.letter) : round;
  return null;
}

function App() {
  const location = useLocation();
  const pageArt = getPageArt(location.pathname);
  const isHangPage = location.pathname === "/hangman";

  const [selectedWord, setSelectedWord] = useState(null);
  const wordToFind = selectedWord?.word ?? "";

  const [innertext, setInnertext] = useState();
  const [disablehint1, setDisablehint1] = useState(false);
  const [disablehint2, setDisablehint2] = useState(false);

  function setInstructions() {
    // function showMore() {
    //   document.getElementById("moretips").style.display = "block";
    //   document.getElementById("showless").style.display = "none";
    // }
    const instructions = (
      <>
        <h4>Instructions</h4>
        <p>Your goal is to revive Artsy by discovering the hidden word.</p>
        <p>
          You are presented with a number of blank spaces representing the
          missing letters you need to find.
        </p>
        <p>You can also use your own keyboard to guess a letter.</p>
        <p>
          <strong>You only have six attempts.</strong>
        </p>
        <h4>Tips</h4>
        <p>To help you on your journey, here are a few tips:</p>
        <p>
          <span style={{ color: "#b40075" }}>♦</span> Vowel First Strategy: It's
          often beneficial to begin by guessing vowels, such as 'A', 'E,' 'I,'
          'O' or 'U'.{" "}
          {/* <span
            id="showless"
            onClick={showMore}
            style={{ color: "#a54ed7", cursor: "pointer" }}
          >
            Read more...
          </span>{" "} */}
        </p>
        {/* <div id="moretips" style={{ display: "none" }}></div> */}
        <p>
          <span style={{ color: "#b40075" }}>♦</span> Mind the Clues: Pay close
          attention to any hints or clues provided along the way by Professor
          Han Fastolfe.
        </p>
        <p>
          <span style={{ color: "#b40075" }}>♦</span> Stay Persistent: Don't be
          discouraged by setbacks. Keep your determination intact and continue
          your pursuit of the hidden word. Remember, every guess brings you one
          step closer to awakening Artsy.
        </p>
        <p style={{ textTransform: "uppercase" }}>
          Begin your journey now and let the power of language and your
          strategic thinking save the day!
        </p>
      </>
    );
    setInnertext(instructions);
    document.getElementById("tips").disabled = true;
  }

  function setWordfacts() {
    if (!selectedWord) return;

    function showMore() {
      document.getElementById("explainmore").style.display = "block";
      document.getElementById("showlessfacts").style.display = "none";
    }

    const handlePlay = () => {
      const audio = new Audio(selectedWord.pronunciation.audio_url);
      audio.play();
    };

    const exampleAttribution = selectedWord.example?.attribution;

    const wordfacts = (
      <div
        style={{
          visibility: Winner || Loser ? "visible" : "hidden",
        }}
      >
        <h3 style={{ marginBottom: "15px" }}>{selectedWord.word}</h3>
        <p>
          <b>Definition:</b> {selectedWord.definition.text}
        </p>
        {selectedWord.definition.part_of_speech && (
          <p>
            <b>Part of speech:</b> {selectedWord.definition.part_of_speech}
          </p>
        )}
        <p>
          <b>Merriam-Webster pronunciation:</b>{" "}
          {selectedWord.pronunciation.mw} <span> </span>
          <img
            src={soundbtn}
            alt="Play pronunciation"
            title="Listen to the word"
            width={36}
            onClick={handlePlay}
            style={{ cursor: "pointer" }}
          />
        </p>

        {selectedWord.example && (
          <div className="word-example">
            <p>
              <b>Example:</b> {selectedWord.example.text}
            </p>
            {exampleAttribution &&
              (exampleAttribution.author ||
                exampleAttribution.source ||
                exampleAttribution.date) && (
                <p className="example-attribution">
                  {exampleAttribution.author && (
                    <span>Author: {exampleAttribution.author}</span>
                  )}
                  {exampleAttribution.source && (
                    <span>Source: {exampleAttribution.source}</span>
                  )}
                  {exampleAttribution.date && (
                    <span>Date: {exampleAttribution.date}</span>
                  )}
                </p>
              )}
          </div>
        )}
        <p
          id="showlessfacts"
          onClick={showMore}
          style={{ color: "#a54ed7", cursor: "pointer" }}
        >
          More about this word
        </p>
        <p id="explainmore" style={{ display: "none" }}>
          <b style={{ color: "#a54ed7" }}>Explanation:</b>{" "}
          {selectedWord.explanation.text}
        </p>
        <div className="mw-attribution">
          <img
            className="mw-attribution-logo"
            src={mwLogo}
            alt="Merriam-Webster logo"
            width={50}
            height={50}
          />
          <span>
            Merriam-Webster&apos;s Collegiate<sup>®</sup> Dictionary with Audio
          </span>
        </div>
      </div>
    );
    setInnertext(wordfacts);
    document.getElementById("tips").disabled = false;
    document.getElementById("hint1").disabled = true;
    document.getElementById("hint2").disabled = true;
  }

  function setHint1() {
    if (!selectedWord) return;

    const hint1 = (
      <>
        <h5>Synonym: {selectedWord.hints.synonym.text}</h5>
      </>
    );
    setDisablehint1(true);
    setInnertext(hint1);
    document.getElementById("hint1").disabled = true;
  }

  function setHint2() {
    if (!selectedWord) return;

    const hint2 = (
      <>
        <h5>A clue: {selectedWord.hints.clue.text}</h5>
      </>
    );
    setDisablehint2(true);
    setInnertext(hint2);
    document.getElementById("hint2").disabled = true;
  }

  const [round, dispatch] = useReducer(roundReducer, null);
  const chosenLetters = round?.guesses ?? [];
  const incorrectGuesses = round ? getIncorrectGuesses(round) : [];
  const status = round ? getRoundStatus(round) : 'playing';
  const Loser = status === 'failed';
  const Winner = status === 'solved';
  useRoundScore(isHangPage ? selectedWord : null, Winner);

  // dispatch is stable and the reducer always sees the latest round, so the
  // physical-keyboard listener can never act on a stale word.
  const addChosenLetter = useCallback(
    (letter) => dispatch({ type: 'guess', letter }),
    []
  );

  useEffect(() => {
    const lastGuess = round && getLastGuess(round);
    if (!lastGuess || lastGuess.correct || getRoundStatus(round) !== 'playing') return;
    const remaining = getRemainingMisses(round);
    setInnertext(
      remaining === 1 ? (
        <h5>You have only {remaining} try left... make it count!</h5>
      ) : (
        <h5>You have {remaining} tries remaining...</h5>
      )
    );
  }, [round]);

  useEffect(() => {
    if (!isHangPage) return;

    const handler = (e) => {
      const key = e.key;
      if (!key.match(/^[a-zA-Z]$/)) return;

      e.preventDefault();
      addChosenLetter(key);
    };

    document.addEventListener("keypress", handler);

    return () => {
      document.removeEventListener("keypress", handler);
    };
  }, [isHangPage, addChosenLetter]);

  useEffect(() => {
    if (!isHangPage) {
      dispatch({ type: 'reset' });
      setInnertext("");
      setSelectedWord(null);
      setDisablehint1(false);
      setDisablehint2(false);
      return;
    }

    const record = selectRandomWord(manifest.words);
    setSelectedWord(record);
    dispatch({ type: 'start', answer: record.word });
  }, [isHangPage]);

  const paintingUrl = selectedWord
    ? buildAssetUrl(
        selectedWord.image.key,
        import.meta.env.VITE_ASSET_BASE_URL || undefined
      )
    : null;

  return (
    <div
      className="page-shell"
      onPointerOverCapture={prefetchLinkArt}
      onFocusCapture={prefetchLinkArt}
      onTouchStartCapture={prefetchLinkArt}
    >
      <PageBackground art={pageArt} />
      <div className="App">
        <Navbar />
        <Routes>
          <Route path="/" element={<Intro />} />
          <Route
            path="/hangman"
            element={
              <>
                {/* <Header /> */}
                <div className="figurefacts">
                  <Figure
                    incorrectGuesses={incorrectGuesses.length}
                    Winner={Winner}
                    Loser={Loser}
                    painting={paintingUrl}
                  />
                  <Wordfacts
                    Loser={Loser}
                    Winner={Winner}
                    innertext={innertext}
                    setWordfacts={setWordfacts}
                    incorrectGuesses={incorrectGuesses.length}
                  />
                </div>
                <Word
                  reveal={Loser}
                  wordToFind={wordToFind}
                  chosenLetters={chosenLetters}
                  Winner={Winner}
                />
                <div
                  style={{
                    alignSelf: "stretch",
                    marginLeft: "10px",
                    marginRight: "10px",
                  }}
                >
                  <Keyboard
                    disabled={Winner || Loser}
                    activeLetters={round ? getCorrectGuesses(round) : []}
                    inactiveLetters={incorrectGuesses}
                    addChosenLetter={addChosenLetter}
                    setInstructions={setInstructions}
                    setHint1={setHint1}
                    setHint2={setHint2}
                    Loser={Loser}
                    Winner={Winner}
                    disablehint1={disablehint1}
                    disablehint2={disablehint2}
                  />
                </div>
                {/* {Winner && "Winner! - Refresh and play again"}
                {Loser && "Arghh... Refresh and play again"} */}
              </>
            }
          />
          <Route
            path="/illucia"
            element={<Illucia />}
          />
          <Route
            path="/hall-of-fame"
            element={<Halloffame Winner={Winner} />}
          />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {/* <Footer /> */}
    </div>
  );
}

export default App;
