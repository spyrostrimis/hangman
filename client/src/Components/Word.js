import React from "react";
import axios from "axios";
import { useEffect } from "react";

const Word = ({
  wordToFind,
  chosenLetters,
  Winner = false,
  reveal = false,
}) => {
  let token = localStorage.getItem("token");

  useEffect(() => {
    if (token) {
      if (Winner) {
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
  }, [Winner]);

  return (
    <div className={`word ${Winner || reveal ? "revealed" : ""}`}>
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

export default Word;
