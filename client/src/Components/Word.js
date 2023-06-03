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

  // async function getWordData() {
  //   let response = await axios.get("http://localhost:8000/word/get-all-words");
  //   console.log("I fire once!");
  //   let allwords = response.data;
  //   // console.log(
  //   //   "getWordData:",
  //   //   allwords[Math.floor(Math.random() * allwords.length)]
  //   // );
  //   return allwords[Math.floor(Math.random() * allwords.length)];
  // }

    async function getWordData() {
      let response = await axios.get(
        "https://hangman-lsq2.onrender.com/word/get-one-word-create-random"
      );
      // console.log(response.data);
      console.log("I fire once!");
      let oneword = response.data;
      // console.log(
      //   "getWordData:",
      //   allwords[Math.floor(Math.random() * allwords.length)]
      // );
      return oneword;
    }

  useEffect(() => {
    console.log("But Do I Fire Once???");
    getWordData()
      .then((data) => {
        setWordToFindData(data);
        return data;
      })
      .then((data) => setWordToFind(data.word));
  }, []);

if (token) {
  if (Winner) {
    console.log("TokenWord:", token);
    console.log("But Do I Fire Once???");
    axios
      .put("http://localhost:8000/user/add100", null, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
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
        gap: "19px",
        fontWeight: "600",
        marginTop: "15px"
      }}
    >
      {wordToFind.split("").map((letter, index) => (
        <span style={{ borderBottom: "solid #cdcdcd" }} key={index}>
          <span
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

export default Word