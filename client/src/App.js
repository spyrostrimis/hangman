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
import soundbtn from "./Images/soundbtn.png";

import { useCallback, useEffect, useState } from "react";
import { Route, Routes, Navigate, useLocation } from "react-router-dom";
// import axios from "axios";
import { Buffer } from "buffer";



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
  const [remainingTries, setRemainingTries] = useState(5);
  console.log("remainingTries1", remainingTries);

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
          vowels, such as 'A', 'E,' 'I,' 'O' or 'U'.{" "}
          {/* <span
            id="showless"
            onClick={showMore}
            style={{ color: "#a54ed7", cursor: "pointer" }}
          >
            Read more...
          </span>{" "} */}
        </p>
        {/* <div id="moretips" style={{ display: "none" }}></div> */}
        <p>
          ♦ Mind the Clues: Pay close attention to any hints or clues provided
          along the way by Professor Han Fastolfe.
        </p>
        <p>
          ♦ Stay Persistent: Don't be discouraged by setbacks. Keep your
          determination intact and continue your pursuit of the hidden word.
          Remember, every guess brings you one step closer to awakening Artsy.
        </p>
        <p style={{ textTransform: "uppercase" }}>
          Begin your journey now and let the power of language and your
          strategic thinking save the day!
        </p>
      </>
    );
    setInnertext(instructions);
    document.getElementById("tips").disabled = true;
  }

  function setWordfacts() {

    function showMore() {
      document.getElementById("explainmore").style.display = "block";
      document.getElementById("showlessfacts").style.display = "none";
    }

    const handlePlay = () => {
      const audio = new Audio(wordToFindData.sound);
      audio.play();
    };

    const wordfacts = (
      <div
        style={{
          visibility: Winner || Loser ? "visible" : "hidden",
        }}
      >
        <h3 style={{ marginBottom: "15px" }}>{wordToFindData.word}</h3>
        <p>
          <b>Definition:</b> {wordToFindData.definition}
        </p>
        <p>
          <b>IPA: {wordToFindData.ipa}</b> <span> </span>
          <img
            src={soundbtn}
            alt={`sound button image`}
            title={`Listen to the word`}
            width={36}
            onClick={handlePlay}
            style={{ cursor: "pointer" }}
          />
        </p>

        <p>
          <b>An example:</b> {wordToFindData.example}
        </p>
        <p
          id="showlessfacts"
          onClick={showMore}
          style={{ color: "#a54ed7", cursor: "pointer" }}
        >
          How is the word used in this example?
        </p>
        <p id="explainmore" style={{ display: "none" }}>
          <b>Explanation:</b> {wordToFindData.explanation}
        </p>

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
        <h5>Synonym: {wordToFindData.synonym}</h5>
      </>
    );
    setInnertext(hint1);
    document.getElementById("hint1").disabled = true;
  }

  function setHint2() {
    const hint2 = (
      <>
        <h5>A clue: {wordToFindData.shortdef}</h5>
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
      console.log("remainingTries2", remainingTries);
      if (chosenLetters.includes(letter) || Winner || Loser) return;

      setChosenLetters((currentLetters) => [...currentLetters, letter]);
      console.log("chosenLetters", chosenLetters);
      console.log("remainingTries3", remainingTries);
      if (!wordToFind.includes(letter)) {
        console.log("remainingTries4", remainingTries);
        setRemainingTries(remainingTries - 1);
        console.log("remainingTries5", remainingTries);
        if (remainingTries > 1) {
          setInnertext(
            <>
              <h5>You have {remainingTries} tries remaining...</h5>
            </>
          );
        }
        if (remainingTries == 1) {
          setInnertext(
            <>
              <h5>You have only {remainingTries} try left... make it count!</h5>
            </>
          );
        }
        
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

  let paintingBase64;
  if (wordToFindData.image) {
    const imageData = wordToFindData.image.data;
    const imageBuffer = Buffer.from(imageData);
    const mimeType = "image/png";
    // console.log("wordToFindData.image", wordToFindData.image);
    paintingBase64 = `data:${mimeType};base64,${imageBuffer.toString(
      "base64"
    )}`;
    // console.log("paintingBase64", paintingBase64);
  }
  

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
                    marginTop: "10px",
                  }}
                >
                  <Figure
                    incorrectGuesses={incorrectGuesses.length}
                    Winner={Winner}
                    painting={paintingBase64 ? paintingBase64 : null}
                  />
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
                <div style={{ color: "transparent"}}>{wordToFind}</div>
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
                {/* {Winner && "Winner! - Refresh and play again"}
                {Loser && "Arghh... Refresh and play again"} */}
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
