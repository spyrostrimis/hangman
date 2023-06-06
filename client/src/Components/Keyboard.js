import React from 'react'
import { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import ronny from "../Images/ronny.png";
import ronnyai from "../Images/ronnyai.png";

const Keyboard = ({
  activeLetters,
  inactiveLetters,
  addChosenLetter,
  disabled = false,
  setInstructions,
  setHint1,
  setHint2,
  Winner,
  Loser,
  disablehint1 = false,
  disablehint2 = false,
}) => {
  const KEYS = [
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
    "l",
    "m",
    "n",
    "o",
    "p",
    "q",
    "r",
    "s",
    "t",
    "u",
    "v",
    "w",
    "x",
    "y",
    "z",
  ];

  // console.log("activeLetters", activeLetters);
  // console.log("inactiveLetters", inactiveLetters);

  const [isFlipped, setIsFlipped] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let delayTimeout;

    if (Winner || Loser) {
      delayTimeout = setTimeout(() => {
        setIsFlipped(true);
      }, 2000);
    } else {
      setIsFlipped(false);
    }

    return () => clearTimeout(delayTimeout);
  }, [Winner, Loser]);

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleNavigate = () => {
    navigate("/hall-of-fame");
  };

  // return (
  //   <div className="keyboardcontainer">
  //     <div className="keyboardhints">
  //       <button id="hint1" onClick={setHint1}>
  //         Hint 1
  //       </button>
  //       <button id="hint2" onClick={setHint2}>
  //         Hint 2
  //       </button>
  //       <button id="tips" onClick={setInstructions}>
  //         INSTRUCTIONS & TIPS
  //       </button>
  //     </div>
  //     <div className="keyboardronny">
  //       <img
  //         src={ronny}
  //         alt={`painting by ChatGPT`}
  //         title={`painting by ChatGPT`}
  //         width={200}
  //       />
  //     </div>
  //     <div
  //       style={{
  //         display: "grid",
  //         gridTemplateColumns: "repeat(auto-fit, minmax(60px, 1fr))",
  //         gap: "7px",
  //         maxWidth: "900px",
  //       }}
  //     >
  //       {KEYS.map((key) => {
  //         const isActive = activeLetters.includes(key);
  //         const isInactive = inactiveLetters.includes(key);
  //         return (
  //           <button
  //             onClick={() => addChosenLetter(key)}
  //             // className="keyboardbtn"
  //             className={`keyboardbtn ${isActive ? "active" : ""} ${
  //               isInactive ? "inactive" : ""
  //             }`}
  //             disabled={isInactive || isActive || disabled}
  //             key={key}
  //           >
  //             {key}
  //           </button>
  //         );
  //       })}
  //     </div>
  //   </div>
  // );
  return (
      <div className={`keyboardcontainer ${isFlipped ? "flipped" : ""}`}>
        <div className="keyboardcontainer-inner">
          <div className="keyboard-front">
            <div className="keyboardhints">
              <button
                id="hint1"
                onClick={setHint1}
                disabled={disablehint1 || disabled}
              >
                Hint 1
              </button>
              <button
                id="hint2"
                onClick={setHint2}
                disabled={disablehint2 || disabled}
              >
                Hint 2
              </button>
              <button id="tips" onClick={setInstructions} disabled={false}>
                INSTRUCTIONS & TIPS
              </button>
            </div>
            <div className="keyboardronny">
              <img
                src={ronnyai}
                alt="painting by ChatGPT"
                title="painting by ChatGPT"
                width={200}
              />
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(60px, 1fr))",
                gap: "7px",
                maxWidth: "900px",
              }}
            >
              {KEYS.map((key) => {
                const isActive = activeLetters.includes(key);
                const isInactive = inactiveLetters.includes(key);
                return (
                  <button
                    onClick={() => addChosenLetter(key)}
                    // className="keyboardbtn"
                    className={`keyboardbtn ${isActive ? "active" : ""} ${
                      isInactive ? "inactive" : ""
                    }`}
                    disabled={isInactive || isActive || disabled}
                    key={key}
                  >
                    {key}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="keyboard-back">
            <div className="keyboardreplay">
              <button id="playagain" onClick={handleRefresh}>
                Play Again!
              </button>
              <button id="checkscore" onClick={handleNavigate}>
                What's your score?
              </button>
            </div>
          </div>
        </div>
      </div>
  );
};

export default Keyboard