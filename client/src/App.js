import './App.css';
import Hello from './Components/Hello';
import Navbar from './Components/Navbar';
import Header from './Components/Header';
import Figure from './Components/Figure';
import Word from "./Components/Word";
import Keyboard from "./Components/Keyboard";
import words from "./wordList.json"

import { useCallback, useEffect, useState } from "react";


function App() {
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
      {Winner && "Winner! - Refresh to try again"}
      {Loser && "Nice Try - Refresh to try again"}
      <br />
      <Hello />
      <br />
      <Navbar />
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
    </div>
  );
}

export default App;
