import React from 'react'
import { useState, useEffect } from "react";

const Wordfacts = ({
  wordToFindData,
  Loser = false,
  Winner = false,
  innertext,
  setWordfacts,
}) => {
  // const instructions = (
  //   <>
  //     <p>Your goal is to find the hidden word.</p>
  //     <p>
  //       You will be presented with a number of blank spaces representing the
  //       missing letters you need to find.
  //     </p>
  //     <p>
  //       Use your keyboard to guess a letter or just click it. To help you on
  //       your journey, here are a few tips:
  //     </p>
  //   </>
  // );

  // const [innertext, setInnertext] = useState();

  useEffect(() => {
    if (Winner || Loser) {
      setWordfacts();
    }
  }, [Loser, Winner]);

  return (
    <div className="wordfactscontainer">
      <div className="wordfactscontainerinner">
        <div>{innertext}</div>
      </div>
    </div>
  );
};

export default Wordfacts