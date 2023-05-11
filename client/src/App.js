import './App.css';
import Hello from './Components/Hello';
import Navbar from './Components/Navbar';
import Header from './Components/Header';
import Figure from './Components/Figure';
import Word from "./Components/Word";
import Keyboard from "./Components/Keyboard";
import words from "./wordList.json"

import { useState } from 'react';


function App() {
  const [wordToFind, setWordToFind] = useState(() => {
    return words[Math.floor(Math.random() * words.length)]
  })
  const [chosenLetters, setChosenLetters] = useState([])
  const incorrectGuesses = chosenLetters.filter( letter => !wordToFind.includes(letter))

  return (
    <div className="App">
      Brand New World
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
      <Word wordToFind={wordToFind} chosenLetters={chosenLetters} />
      <br />
      <div
        style={{
          alignSelf: "stretch",
          marginLeft: "10px",
          marginRight: "10px",
        }}
      >
        <Keyboard />
      </div>
    </div>
  );
}

export default App;
