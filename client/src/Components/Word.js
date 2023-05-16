import React from 'react'
import axios from "axios";
import { useCallback, useEffect, useState } from "react";

const Word = ({
  wordToFind,
  setWordToFindData,
  setWordToFind,
  chosenLetters,
  Winner = false,
  reveal = false,
}) => {

  let token = localStorage.getItem("token");

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

if (token) {
  if (Winner) {
    axios
      .put("http://localhost:8000/user/add100")
      .then((res) => {
        console.log(res.data);
      })
      .catch((error) => {
        console.log(error);
      });
  }
}

  return (
    <div
      style={{
        fontFamily: "monospace",
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