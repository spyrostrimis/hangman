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
import Halloffame from "./Components/Halloffame";
import Footer from './Components/Footer';

import { useCallback, useEffect, useState } from "react";
import { Route, Routes, Navigate, useLocation } from "react-router-dom";
// import axios from "axios";



function App() {
  // async function getWord() {
  //   let response = await axios.get("http://localhost:8000/word/get-all-words");
  //   console.log("I fire once!");
  //   let allwords = response.data;
  //   console.log(allwords[Math.floor(Math.random() * allwords.length)].word);
  //   return allwords[Math.floor(Math.random() * allwords.length)].word;
  // }

  const location = useLocation();
  const isHangPage = location.pathname === "/hangman";

  const [wordToFindData, setWordToFindData] = useState("");
  const [wordToFind, setWordToFind] = useState("");
  // console.log("wordToFindData.word", wordToFindData.word);
  // console.log("wordToFindData", wordToFindData);
  // setWordToFind(wordToFindData.word);
  // useEffect(() => {
  //   getWord().then((word) => setWordToFind(word));
  // }, []);

  const [innertext, setInnertext] = useState();
  const [isPlaying, setIsPlaying] = useState(false);

  function setInstrunctions() {
    const instructions = (
      <>
        <p>Your goal is to find the hidden word.</p>
        <p>
          You will be presented with a number of blank spaces representing the
          missing letters you need to find.
        </p>
        <p>
          Use your keyboard to guess a letter or just click it. To help you on
          your journey, here are a few tips:
        </p>
      </>
    );
    setInnertext(instructions);
    document.getElementById("tips").disabled = true;
  }

  function setWordfacts() {

    const handlePlay = () => {
      setIsPlaying(true);
      const audio = new Audio(wordToFindData.sound);
      audio.play();
      audio.onended = () => setIsPlaying(false);
    };

    const wordfacts = (
      <div
        style={{
          visibility: Winner || Loser ? "visible" : "hidden",
        }}
      >
        <p>Definition: {wordToFindData.definition}</p>
        <p>{wordToFindData.example}</p>
        {/* <p>{wordToFindData.explanation}</p> */}
        <p>{wordToFindData.synonym}</p>
        <p>{wordToFindData.shortdef}</p>
        <p>{wordToFindData.ipa}</p>

        <button disabled={isPlaying} onClick={handlePlay}>
            {isPlaying ? "Playing..." : "Play Sound"}
          </button>
          {/* <div>
            <img
              src={wordToFindData.image}
              alt={`"${wordToFindData.word}" painting by ChatGPT`}
              title={`"${wordToFindData.word}" by ChatGPT`}
              width={300}
            />
          </div> */}
      </div>
    );
    setInnertext(wordfacts);
    document.getElementById("tips").disabled = false;
    document.getElementById("hint1").disabled = true;
    document.getElementById("hint2").disabled = true;
  }

  function setHint1() {
    const instructions = (
      <>
        <p>{wordToFindData.synonym}</p>
        <p>
          You will be presented with a number of blank spaces representing the
          missing letters you need to find.
        </p>
        <p>
          Use your keyboard to guess a letter or just click it. To help you on
          your journey, here are a few tips:
        </p>
      </>
    );
    setInnertext(instructions);
    document.getElementById("hint1").disabled = true;
  }

  function setHint2() {
    const instructions = (
      <>
        <p>{wordToFindData.shortdef}</p>
        <p>
          You will be presented with a number of blank spaces representing the
          missing letters you need to find.
        </p>
        <p>
          Use your keyboard to guess a letter or just click it. To help you on
          your journey, here are a few tips:
        </p>
      </>
    );
    setInnertext(instructions);
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
  console.log("Winner:", Winner);

  const addChosenLetter = useCallback(
    (letter) => {
      if (chosenLetters.includes(letter)) return;

      setChosenLetters((currentLetters) => [...currentLetters, letter]);
      console.log(chosenLetters);
    },
    [chosenLetters, Winner, Loser]
  );

  useEffect(() => {
    if (!isHangPage) {
      // || Winner || Loser
      // Skip the effect if not on the homepage - *or if the game is over - removed*
      setChosenLetters([]);
      setInnertext();
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
  }, [isHangPage]); // removed chosenLetters,

  // useEffect(() => {
  //   if (isHomePage && !Winner && !Loser) {
  //     // Simulate a click event to initialize the game
  //     const clickEvent = new MouseEvent("click");
  //     document.dispatchEvent(clickEvent);
  //   }

  //   // Rest of the code...
  // }, []);

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
                <br />
                <div
                  id="figurefacts"
                  style={{
                    width: "100%",
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                    justifyItems: "center",
                    gap: "20px",
                    marginTop: "20px",
                  }}
                >
                  <Figure incorrectGuesses={incorrectGuesses.length} />
                  <Wordfacts
                    Loser={Loser}
                    Winner={Winner}
                    wordToFindData={wordToFindData}
                    innertext={innertext}
                    setWordfacts={setWordfacts}
                  />
                </div>
                <br />
                <div>{wordToFind}</div>
                <br />
                <Word
                  reveal={Loser}
                  wordToFind={wordToFind}
                  chosenLetters={chosenLetters}
                  setWordToFindData={setWordToFindData}
                  setWordToFind={setWordToFind}
                  Winner={Winner}
                />
                <br />
                <div
                  style={{
                    alignSelf: "stretch",
                    marginLeft: "10px",
                    marginRight: "10px",
                    backgroundColor: "#9e9e9e94",
                  }}
                >
                  <Keyboard
                    disabled={Winner || Loser}
                    activeLetters={chosenLetters.filter((letter) =>
                      wordToFind.includes(letter)
                    )}
                    inactiveLetters={incorrectGuesses}
                    addChosenLetter={addChosenLetter}
                    setInstrunctions={setInstrunctions}
                    setHint1={setHint1}
                    setHint2={setHint2}
                  />
                </div>
                <br />
                {Winner && "Winner! - Refresh and play again"}
                {Loser && "Arghh... Refresh and play again"}
              </>
            }
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
