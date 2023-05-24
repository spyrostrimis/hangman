import React from 'react'
import { Link } from "react-router-dom";
import ronny from "../Images/ronny.png";
import artsy from "../Images/artsy.png";
import { Tooltip } from "react-tooltip";


const Intro = () => {
  return (
    <>
      <div className="introcontainer">
        {/* <h3>ABOUT THE GAME</h3> */}
        <img
          src={ronny}
          data-tooltip-id="my-tooltip"
          data-tooltip-content="Han Fastolfe, Professor of English Literature."
          style={{ float: "right", height: "160px" }}
        />
        <p>Welcome to the Hangman Rescue Mission!</p>

        <p>
          Professor Han Fastolfe urgently seeks your assistance. His dear friend
          Artsy has mysteriously shut down. Only one thing can awaken Artsy from
          its slumber — a secret word.
        </p>
        <p>
          Your mission, should you choose to accept it, is to discover the
          hidden word that will breathe life back into Artsy.
        </p>
        <h3 style={{ marginBottom: "17px" }}>But beware!</h3>

        <p>
          You have a limited number of attempts. With each incorrect guess, the
          situation becomes more precarious.
        </p>
        <p style={{ marginBottom: "10px" }}>
          Choose your letters wisely and pay attention to any clues provided by
          Professor Fastolfe to guide you on this captivating quest.
        </p>
        <div style={{ textAlign: "center" }}>
          <img src={artsy} style={{ height: "123px" }} />
        </div>
      </div>
      <div style={{marginTop: "50px"}}>
        <Link to="/hangman">
          <button id='introbtn'>Play Hangman</button>
        </Link>
      </div>
      <Tooltip id="my-tooltip" place="bottom" />
    </>
  );
}

export default Intro