import React from 'react'



const Word = ({ wordToFind, chosenLetters }) => {
  return (
    <div
      style={{
        fontSize: "2rem",
        textTransform: "uppercase",
        display: "flex",
        gap: "1rem",
      }}
    >
      {wordToFind.split("").map((letter, index) => (
        <span style={{ borderBottom: "solid black" }} key={index}>
          <span
            style={{
              visibility: chosenLetters.includes(letter) ? "visible" : "hidden",
            }}
          >
            {letter}
          </span>
        </span>
      ))}
    </div>
  );
};

export default Word