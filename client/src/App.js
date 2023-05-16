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
import words from "./wordList.json"

import { useCallback, useEffect, useState } from "react";
import { Route, Routes, Navigate, useLocation } from "react-router-dom";
import axios from "axios";



function App() {
  // async function getWord() {
  //   let response = await axios.get("http://localhost:8000/word/get-all-words");
  //   console.log("I fire once!");
  //   let allwords = response.data;
  //   console.log(allwords[Math.floor(Math.random() * allwords.length)].word);
  //   return allwords[Math.floor(Math.random() * allwords.length)].word;
  // }

  const location = useLocation();
  // const isHomePage = location.pathname === "/";

  const [wordToFindData, setWordToFindData] = useState('');
  const [wordToFind, setWordToFind] = useState("");
  console.log("wordToFindData.word", wordToFindData.word);
  console.log("wordToFindData", wordToFindData);
  // setWordToFind(wordToFindData.word);
  // useEffect(() => {
  //   getWord().then((word) => setWordToFind(word));
  // }, []);

  const [chosenLetters, setChosenLetters] = useState([]);
  const incorrectGuesses = chosenLetters.filter(
    (letter) => !wordToFind.includes(letter)
  );

  const Loser = incorrectGuesses.length >= 6;
  const Winner = wordToFind
    .split("")
    .every((letter) => chosenLetters.includes(letter));

  const addChosenLetter = useCallback(
    (letter) => {
      if (chosenLetters.includes(letter)) return;

      setChosenLetters((currentLetters) => [...currentLetters, letter]);
      console.log(chosenLetters);
    },
    [chosenLetters, Winner, Loser]
  );

  useEffect(() => {
    // if (!isHomePage || Winner || Loser) {
    //   // Skip the effect if not on the homepage - *or if the game is over - removed*
    //   return;
    // }
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
  }, [chosenLetters]); // , isHomePage

  // useEffect(() => {
  //   if (isHomePage && !Winner && !Loser) {
  //     // Simulate a click event to initialize the game
  //     const clickEvent = new MouseEvent("click");
  //     document.dispatchEvent(clickEvent);
  //   }

  //   // Rest of the code...
  // }, []);

  return (
    <div className="App">
      <Navbar />
      <Routes>
        <Route path="/" element={<Intro />} />
        <Route
          path="/hangman"
          element={
            <>
              <Header />

              <br />
              <br />
              <div
                id="figurefacts"
                style={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                  justifyItems: "center",
                }}
              >
                <Figure incorrectGuesses={incorrectGuesses.length} />
                <Wordfacts Loser={Loser} Winner={Winner} wordToFindData={wordToFindData} />
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
              />
              <br />
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
                />
              </div>
              <br />
              {Winner && "Winner! - Refresh to try again"}
              {Loser && "Nice Try - Refresh to try again"}
            </>
          }
        />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
