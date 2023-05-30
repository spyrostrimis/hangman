import React from 'react'
import { Link } from "react-router-dom";
import ronny from "../Images/ronny.png";
import artsy from "../Images/artsy.png";
import { Tooltip } from "react-tooltip";


const Intro = () => {
  return (
    <>
      <span
        style={{ color: "#edee02", textShadow: "0px 0px 15px #edee02" }}
      ></span>
      <div className="introcontainer">
        {/* <h3>ABOUT THE GAME</h3> */}
        <img
          src={ronny}
          data-tooltip-id="my-tooltip"
          data-tooltip-content="Han Fastolfe, Professor of English Literature."
          style={{ float: "right", height: "160px" }}
        />
        <p>
          Welcome to the{" "}
          <span
            style={{ color: "#edee02", textShadow: "0px 0px 15px #edee02" }}
          >
            Hangman
          </span>{" "}
          Rescue Mission!
        </p>

        <p>
          Professor Han Fastolfe urgently seeks your assistance. His dear friend
          Artsy has mysteriously shut down. Only one thing can awaken Artsy from
          its slumber —{" "}
          <span
            style={{ color: "#edee02", textShadow: "0px 0px 15px #edee02" }}
          >
            a secret word.
          </span>
        </p>
        <p>Discover it and breathe life back into Artsy.</p>
        <h3 style={{ marginBottom: "17px" }}>But beware!</h3>

        <p>
          You have a limited number of{" "}
          <span
            style={{ color: "#edee02", textShadow: "0px 0px 15px #edee02" }}
          >
            attempts.
          </span>{" "}
          With each incorrect guess, the situation becomes more precarious.
        </p>
        <p style={{ marginBottom: "10px" }}>
          Choose your letters wisely and pay attention to any clues provided by
          Professor Fastolfe to guide you on this{" "}
          <span
            style={{ color: "#edee02", textShadow: "0px 0px 15px #edee02" }}
          >
            captivating quest.
          </span>
        </p>
        <div style={{ textAlign: "center" }}>
          <img src={artsy} style={{ height: "123px" }} />
        </div>
      </div>
      <div style={{ marginTop: "43px" }}>
        <Link to="/hangman">
          <button id="introbtn">Play Hangman</button>
        </Link>
      </div>
      <Tooltip id="my-tooltip" place="bottom" />
    </>
  );
}

export default Intro