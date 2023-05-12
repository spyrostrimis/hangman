import React from 'react'



const Word = ({ wordToFind, chosenLetters, reveal = false }) => {
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
              visibility:
                chosenLetters.includes(letter) || reveal ? "visible" : "hidden",
              color:
                !chosenLetters.includes(letter) && reveal ? "red" : "black",
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