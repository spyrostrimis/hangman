import './App.css';
// import Hello from './Components/Hello';
import Navbar from './Components/Navbar';
// import AuthWrapper from "./Components/AuthWrapper";
import Intro from './Components/Intro';
import Signup from "./Components/Signup";
import Login from "./Components/Login";
import Header from './Components/Header';
import Figure from './Components/Figure';
import Word from "./Components/Word";
import Wordfacts from './Components/Wordfacts';
import Keyboard from "./Components/Keyboard";
import Halloffame from "./Components/Halloffame";
import Footer from './Components/Footer';

import { useCallback, useEffect, useState } from "react";
import { Route, Routes, Navigate, useLocation } from "react-router-dom";
// import axios from "axios";



function App() {
  // async function getWord() {
  //   let response = await axios.get("http://localhost:8000/word/get-all-words");
  //   console.log("I fire once!");
  //   let allwords = response.data;
  //   console.log(allwords[Math.floor(Math.random() * allwords.length)].word);
  //   return allwords[Math.floor(Math.random() * allwords.length)].word;
  // }

  const location = useLocation();
  const isHangPage = location.pathname === "/hangman";

  const [wordToFindData, setWordToFindData] = useState("");
  const [wordToFind, setWordToFind] = useState("");
  // console.log("wordToFindData.word", wordToFindData.word);
  // console.log("wordToFindData", wordToFindData);
  // setWordToFind(wordToFindData.word);
  // useEffect(() => {
  //   getWord().then((word) => setWordToFind(word));
  // }, []);

  const [innertext, setInnertext] = useState();
  const [isPlaying, setIsPlaying] = useState(false);
  const [remainingTries, setRemainingTries] = useState(6);

  function setInstrunctions() {
    function showMore() {
      document.getElementById("moretips").style.display = "block";
      document.getElementById("showless").style.display = "none";
    }
    const instructions = (
      <>
        <h4>Instructions</h4>
        <p>Your goal is to revive Artsy by discovering the hidden word.</p>
        <p>
          You are presented with a number of blank spaces representing the
          missing letters you need to find.
        </p>
        <p>You can also use your own keyboard to guess a letter.</p>
        <p>
          <strong>You only have six attempts.</strong>
        </p>
        <h4>Tips</h4>
        <p>To help you on your journey, here are a few tips:</p>
        <p>
          ♦ Vowel First Strategy: It's often beneficial to begin by guessing
          vowels, such as 'A', 'E,' 'I,' 'O' or 'U'. <span
            id="showless"
            onClick={showMore}
            style={{ color: "yellowgreen", cursor: "pointer" }}
          > 
            Read more...
          </span>{" "}
        </p>
        <div id="moretips" style={{ display: "none" }}>
          <p>
            ♦ Mind the Clues: Pay close attention to any hints or clues provided
            along the way. Professor Han Fastolfe may offer insights or guide
            you towards the correct path.
          </p>
          <p>
            ♦ Stay Persistent: Don't be discouraged by setbacks. Keep your
            determination intact and continue your pursuit of the Hangman word.
            Remember, every guess brings you one step closer to awakening Artsy.
          </p>
          <p style={{ textTransform: "uppercase" }}>
            Begin your journey now and let the power of language and your
            strategic thinking save the day!
          </p>
        </div>
      </>
    );
    setInnertext(instructions);
    document.getElementById("tips").disabled = true;
  }

  // function setInstrunctions() {
  //   const [showMore, setShowMore] = useState(false);
  //   console.log("showMore", showMore);

  //   const toggleShowMore = () => {
  //     setShowMore(true);
  //     console.log("showMore2", showMore);
  //     // setInnertext(instructions);
  //   };

  //   const instructions = (
  //     <>
  //       <h4>Instructions</h4>
  //       <p>Your goal is to revive Artsy by discovering the hidden word.</p>
  //       <p>
  //         You are presented with a number of blank spaces representing the
  //         missing letters you need to find.
  //       </p>
  //       <p>You can also use your own keyboard to guess a letter.</p>
  //       <h4>Tips</h4>
  //       <p>To help you on your journey, here are a few tips:</p>
  //       {console.log("showMore3", showMore)}
  //       {showMore ? (
  //         <>
  //           <p>
  //             ♦ Guess Wisely: <strong>You have six attempts</strong> to guess
  //             the letters that form the Hangman word. Choose your letters
  //             carefully to maximize your chances of success.
  //           </p>
  //           <p>
  //             ♦ Vowel First Strategy: It's often beneficial to begin by guessing
  //             vowels, such as 'A,' 'E,' 'I,' 'O,' or 'U.' These frequently
  //             occurring letters might provide valuable clues to unlock the
  //             mystery word.
  //           </p>
  //           <p>
  //             ♦ Mind the Clues: Pay close attention to any hints or clues
  //             provided along the way. Professor Han Fastolfe may offer insights
  //             or guide you towards the correct path.
  //           </p>
  //           <p>
  //             ♦ Stay Persistent: Don't be discouraged by setbacks. Keep your
  //             determination intact and continue your pursuit of the Hangman
  //             word. Remember, every guess brings you one step closer to
  //             awakening Artsy.
  //           </p>
  //           <p>
  //             Begin your journey now and let the power of language and your
  //             strategic thinking save the day!
  //           </p>
  //         </>
  //       ) : (
  //         <p>
  //           ♦ Guess Wisely: <strong>You have six attempts</strong> to guess the
  //           letters that form the Hangman word. Choose your letters carefully to
  //           maximize your chances of success.
  //           <button onClick={toggleShowMore}>Read More</button>
  //         </p>
  //       )}
  //     </>
  //   );

  //   setInnertext(instructions);
  //   document.getElementById("tips").disabled = true;
  // }

  function setWordfacts() {
    const handlePlay = () => {
      setIsPlaying(true);
      const audio = new Audio(wordToFindData.sound);
      audio.play();
      audio.onended = () => setIsPlaying(false);
    };

    const wordfacts = (
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

        <button disabled={isPlaying} onClick={handlePlay}>
          {isPlaying ? "Playing..." : "Play Sound"}
        </button>
        {/* <div>
            <img
              src={wordToFindData.image}
              alt={`"${wordToFindData.word}" painting by ChatGPT`}
              title={`"${wordToFindData.word}" by ChatGPT`}
              width={300}
            />
          </div> */}
      </div>
    );
    setInnertext(wordfacts);
    document.getElementById("tips").disabled = false;
    document.getElementById("hint1").disabled = true;
    document.getElementById("hint2").disabled = true;
  }

  function setHint1() {
    const hint1 = (
      <>
        <p>Synonym: {wordToFindData.synonym}</p>
      </>
    );
    setInnertext(hint1);
    document.getElementById("hint1").disabled = true;
  }

  function setHint2() {
    const hint2 = (
      <>
        <p>A short definition: {wordToFindData.shortdef}</p>
      </>
    );
    setInnertext(hint2);
    document.getElementById("hint2").disabled = true;
  }

  const [chosenLetters, setChosenLetters] = useState([]);
  const incorrectGuesses = chosenLetters.filter(
    (letter) => !wordToFind.includes(letter)
  );

  const Loser = incorrectGuesses.length >= 6;
  const Winner =
    wordToFind &&
    wordToFind.split("").every((letter) => chosenLetters.includes(letter));
  console.log("Winner:", Winner);

  const addChosenLetter = useCallback(
    (letter) => {
      if (chosenLetters.includes(letter) || Winner || Loser) return;

      setChosenLetters((currentLetters) => [...currentLetters, letter]);
      console.log(chosenLetters);
      if (!wordToFind.includes(letter)) {
        setRemainingTries((prevTries) => prevTries - 1);
        setInnertext(
          <>
            <h5>You have {remainingTries - 1} tries remaining...</h5>
          </>
        );
      }
    },
    [chosenLetters, wordToFind, remainingTries, Winner, Loser]
  );

  useEffect(() => {
    if (!isHangPage) {
      // || Winner || Loser
      // Skip the effect if not on the homepage - *or if the game is over - removed*
      // setChosenLetters([]);
      return;
    }
    // e: KeyboardEvent
    const handler = (e) => {
      const key = e.key;
      if (!key.match(/^[a-zA-Z]$/)) return;

      e.preventDefault();
      addChosenLetter(key);
    };

    document.addEventListener("keypress", handler);

    return () => {
      document.removeEventListener("keypress", handler);
    };
  }, [chosenLetters, isHangPage]); // removed chosenLetters,

  // useEffect(() => {
  //   if (isHomePage && !Winner && !Loser) {
  //     // Simulate a click event to initialize the game
  //     const clickEvent = new MouseEvent("click");
  //     document.dispatchEvent(clickEvent);
  //   }

  //   // Rest of the code...
  // }, []);

  useEffect(() => {
    if (!isHangPage) {
      // || Winner || Loser
      // Skip the effect if not on the homepage - *or if the game is over - removed*
      setChosenLetters([]);
      setRemainingTries(6);
      setInnertext("")
      return;
    }

    // Rest of the code...
  }, [isHangPage]);

  return (
    <>
      <div className="App">
        <Navbar />
        <Routes>
          <Route path="/" element={<Intro />} />
          <Route
            path="/hangman"
            element={
              <>
                {/* <Header /> */}
                <br />
                <div
                  id="figurefacts"
                  style={{
                    width: "100%",
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                    justifyItems: "center",
                    gap: "20px",
                    marginTop: "20px",
                  }}
                >
                  <Figure incorrectGuesses={incorrectGuesses.length} />
                  <Wordfacts
                    Loser={Loser}
                    Winner={Winner}
                    wordToFindData={wordToFindData}
                    innertext={innertext}
                    setWordfacts={setWordfacts}
                    incorrectGuesses={incorrectGuesses.length}
                  />
                </div>
                <br />
                <div>{incorrectGuesses.length}</div>
                <div>{wordToFind}</div>
                <br />
                <Word
                  reveal={Loser}
                  wordToFind={wordToFind}
                  chosenLetters={chosenLetters}
                  setWordToFindData={setWordToFindData}
                  setWordToFind={setWordToFind}
                  Winner={Winner}
                />
                <br />
                <div
                  style={{
                    alignSelf: "stretch",
                    marginLeft: "10px",
                    marginRight: "10px",
                    backgroundColor: "#9e9e9e94",
                  }}
                >
                  <Keyboard
                    disabled={Winner || Loser}
                    activeLetters={chosenLetters.filter((letter) =>
                      wordToFind.includes(letter)
                    )}
                    inactiveLetters={incorrectGuesses}
                    addChosenLetter={addChosenLetter}
                    setInstrunctions={setInstrunctions}
                    setHint1={setHint1}
                    setHint2={setHint2}
                  />
                </div>
                {Winner && "Winner! - Refresh and play again"}
                {Loser && "Arghh... Refresh and play again"}
              </>
            }
          />
          <Route
            path="/hall-of-fame"
            element={<Halloffame Winner={Winner} />}
          />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {/* <Footer /> */}
    </>
  );
}

export default App;
