import './App.css';
// import Hello from './Components/Hello';
import Navbar from './Components/Navbar';
// import AuthWrapper from "./Components/AuthWrapper";
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

import { useCallback, useEffect, useState } from "react";
import { Route, Routes, Navigate, useLocation } from "react-router-dom";

function App() {
  const location = useLocation();
  const isHangPage = location.pathname === "/hangman";

  const [selectedWord, setSelectedWord] = useState(null);
  const wordToFind = selectedWord?.word ?? "";

  const [innertext, setInnertext] = useState();
  const [remainingTries, setRemainingTries] = useState(5);
  const [disablehint1, setDisablehint1] = useState(false);
  const [disablehint2, setDisablehint2] = useState(false);
  // console.log("remainingTries1", remainingTries);

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

  const [chosenLetters, setChosenLetters] = useState([]);
  const incorrectGuesses = chosenLetters.filter(
    (letter) => !wordToFind.includes(letter)
  );

  const Loser = incorrectGuesses.length >= 6;
  const Winner =
    wordToFind &&
    wordToFind.split("").every((letter) => chosenLetters.includes(letter));
  // console.log("Winner:", Winner);

  const addChosenLetter = useCallback(
    (letter) => {
      // console.log("remainingTries2", remainingTries);
      // console.log("wordToFind2", wordToFind);
      if (chosenLetters.includes(letter) || Winner || Loser) return;

      setChosenLetters((currentLetters) => [...currentLetters, letter]);
      // console.log("chosenLetters", chosenLetters);
      // console.log("remainingTries3", remainingTries);
      if (!wordToFind.includes(letter)) {
        // console.log("remainingTries4", remainingTries);
        // console.log("wordToFind4", wordToFind);
        setRemainingTries(remainingTries - 1);
        // console.log("remainingTries5", remainingTries);
        if (remainingTries > 1) {
          setInnertext(
            <>
              <h5>You have {remainingTries} tries remaining...</h5>
            </>
          );
        }
        if (remainingTries == 1) {
          setInnertext(
            <>
              <h5>You have only {remainingTries} try left... make it count!</h5>
            </>
          );
        }
      }
    },
    [chosenLetters, wordToFind, remainingTries, Winner, Loser]
  );

  useEffect(() => {
    if (!isHangPage) {
      // || Winner || Loser
      // Skip the effect if not on the homepage - *or if the game is over - removed*
      // setChosenLetters([]);
      return;
    }
    // e: KeyboardEvent
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
  }, [chosenLetters, isHangPage]); // removed chosenLetters,

  useEffect(() => {
    if (!isHangPage) {
      // || Winner || Loser
      // Skip the effect if not on the homepage - *or if the game is over - removed*
      setChosenLetters([]);
      setRemainingTries(5);
      setInnertext("");
      setSelectedWord(null);
      setDisablehint1(false);
      setDisablehint2(false);
      return;
    }

    setSelectedWord(selectRandomWord(manifest.words));
  }, [isHangPage]);

  const paintingUrl = selectedWord
    ? buildAssetUrl(
        selectedWord.image.key,
        import.meta.env.VITE_ASSET_BASE_URL || undefined
      )
    : null;

  return (
    <>
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
                <div style={{ color: "transparent" }}>{wordToFind}</div>
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
                    activeLetters={chosenLetters.filter((letter) =>
                      wordToFind.includes(letter)
                    )}
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
    </>
  );
}

export default App;
