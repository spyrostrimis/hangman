import React from 'react'
import axios from "axios";
import { useCallback, useEffect, useState } from "react";

const Word = ({
  wordToFind,
  setWordToFindData,
  setWordToFind,
  chosenLetters,
  reveal = false,
}) => {
  async function getWordData() {
    let response = await axios.get("http://localhost:8000/word/get-all-words");
    console.log("I fire once!");
    let allwords = response.data;
    console.log(
      "getWordData:",
      allwords[Math.floor(Math.random() * allwords.length)]
    );
    return allwords[Math.floor(Math.random() * allwords.length)];
  }

  useEffect(() => {
    getWordData()
      .then((data) => {
        setWordToFindData(data);
        return data;
      })
      .then((data) => setWordToFind(data.word));
  }, []);

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