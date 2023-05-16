import React from 'react'

const Wordfacts = ({
  wordToFindData,
    Loser = false,
  Winner = false
}) => {
    return (
      <div
        style={{
          visibility: Winner || Loser ? "visible" : "hidden",
        }}
      >
        <p>Definition: {wordToFindData.definition}</p>
        <p>{wordToFindData.example}</p>
        <p>{wordToFindData.explanation}</p>
      </div>
    );
    
};

export default Wordfacts