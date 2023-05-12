import './App.css';
// import Hello from './Components/Hello';
import Navbar from './Components/Navbar';
// import AuthWrapper from "./Components/AuthWrapper";
import Signup from "./Components/Signup";
import Login from "./Components/Login";
import Header from './Components/Header';
import Figure from './Components/Figure';
import Word from "./Components/Word";
import Keyboard from "./Components/Keyboard";
import words from "./wordList.json"

import { useCallback, useEffect, useState } from "react";
import { Route, Routes, Navigate, useLocation } from "react-router-dom";


function App() {
  const location = useLocation();
  const isHomePage = location.pathname === "/";

  const [wordToFind, setWordToFind] = useState(() => {
    return words[Math.floor(Math.random() * words.length)]
  })
  const [chosenLetters, setChosenLetters] = useState([])
  const incorrectGuesses = chosenLetters.filter(letter => !wordToFind.includes(letter))

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
    if (!isHomePage || Winner || Loser) {
      // Skip the effect if not on the homepage - *or if the game is over - removed*
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
  }, [chosenLetters]);

  return (
    <div className="App">
      <Navbar />
      <Routes>
        <Route
          path="/"
          element={
            <>
              {Winner && "Winner! - Refresh to try again"}
                {Loser && "Nice Try - Refresh to try again"}
                <br />
                <Header />
                <br />
                <Figure incorrectGuesses={incorrectGuesses.length} />
                <br />
                <div>{wordToFind}</div>
                <br />
                <Word
                  reveal={Loser}
                  wordToFind={wordToFind}
                  chosenLetters={chosenLetters}
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
