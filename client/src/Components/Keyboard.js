import React from 'react'
import ronny from "../Images/ronny.png";

const Keyboard = ({
  activeLetters,
  inactiveLetters,
    addChosenLetter,
    disabled = false
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

    console.log("activeLetters", activeLetters);
    console.log("inactiveLetters", inactiveLetters);
    
  return (
    <div className="keyboardcontainer">
      <div className="keyboardronny">
        <img
          src={ronny}
          alt={`painting by ChatGPT`}
          title={`painting by ChatGPT`}
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
  );
};

export default Keyboard