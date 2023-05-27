import React from 'react'
import { useState } from "react";

const Wordfacts = ({
  wordToFindData,
    Loser = false,
  Winner = false
}) => {
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlay = () => {
    setIsPlaying(true);
    const audio = new Audio(wordToFindData.sound);
    audio.play();
    audio.onended = () => setIsPlaying(false);
  };

  return (
      <div className="wordfactscontainer">
        {/* <h1>Han's Corner</h1> */}
        <div className="wordfactscontainerinner">
          <div
            style={{
              visibility: Winner || Loser ? "visible" : "hidden",
            }}
          >
            <p>Definition: {wordToFindData.definition}</p>
            <p>{wordToFindData.example}</p>
            {/* <p>{wordToFindData.explanation}</p> */}
            <p>{wordToFindData.synonym}</p>
            <p>{wordToFindData.shortdef}</p>
            <p>{wordToFindData.ipa}</p>

            {/* <button disabled={isPlaying} onClick={handlePlay}>
            {isPlaying ? "Playing..." : "Play Sound"}
          </button>
          <div>
            <img
              src={wordToFindData.image}
              alt={`"${wordToFindData.word}" painting by ChatGPT`}
              title={`"${wordToFindData.word}" by ChatGPT`}
              width={300}
            />
          </div> */}
          </div>
        </div>
      </div>
  );
    
};

export default Wordfacts