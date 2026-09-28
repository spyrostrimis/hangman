import React from "react";

const Word = ({
  wordToFind,
  chosenLetters,
  Winner = false,
  reveal = false,
}) => {
  return (
    <div className={`word ${Winner || reveal ? "revealed" : ""}`}>
      {wordToFind.split("").map((letter, index) => (
        <span key={index}>
          <span
            className={chosenLetters.includes(letter) ? "found" : reveal ? "missed" : ""}
            style={{
              visibility:
                chosenLetters.includes(letter) || reveal ? "visible" : "hidden",
              color:
                !chosenLetters.includes(letter) && reveal
                  ? "#b20074"
                  : "#cdcdcd",
            }}
          >
            {letter}
          </span>
        </span>
      ))}
    </div>
  );
};

export default Word;
