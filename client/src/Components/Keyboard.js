import React from 'react'

const Keyboard = () => {
    const KEYS = [
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "J",
      "K",
      "L",
      "M",
      "N",
      "O",
      "P",
      "Q",
      "R",
      "S",
      "T",
      "U",
      "V",
      "W",
      "X",
      "Y",
      "Z"
    ];
  return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(75px, 1fr))", gap: ".5rem"
    }}>{KEYS.map((key) => 
          <button key={key} className='keyboardbtn'>{key}</button> )}</div>
  )
}

export default Keyboard