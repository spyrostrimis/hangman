import React from 'react'
import { Link } from "react-router-dom";


const Intro = () => {
  return (
    <div>
      <Link to="/hangman">
        <button>Play Hangman</button>
      </Link>

      <h3>Instructions</h3>
      <p>
        Guess the letters in the secret word to solve the puzzle. You can guess
        a letter by clicking it or typing it on your keyboard.
      </p>
    </div>
  );
}

export default Intro