import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import hanai from "../Images/hanai.png";
import artsy from "../Images/artsy.png";
// import { Tooltip } from "react-tooltip";
import ronny from "../Images/ronny.png";
import ronnyai from "../Images/ronnyai.png";
import Button from "react-bootstrap/Button";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Popover from "react-bootstrap/Popover";

const Intro = () => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverOpen2, setPopoverOpen2] = useState(false);
  const popoverRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setPopoverOpen(false);
        setPopoverOpen2(false);
        document.getElementById("root").classList.remove("blur-effect");
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const handlePopoverOpen = () => {
    setPopoverOpen(true);
    document.getElementById("root").classList.add("blur-effect");
  };

  const handlePopoverClose = () => {
    setPopoverOpen(false);
    document.getElementById("root").classList.remove("blur-effect");
  };

  const handlePopoverOpen2 = () => {
    setPopoverOpen2(true);
    document.getElementById("root").classList.add("blur-effect");
  };

  const handlePopoverClose2 = () => {
    setPopoverOpen2(false);
    document.getElementById("root").classList.remove("blur-effect");
  };

  const popoverContent = (
    <Popover id="popover-basic">
      <Popover.Header>
        Popover right
        <Button
          variant="link"
          className="popover-close-btn"
          onClick={handlePopoverClose}
        >
          &times;
        </Button>
      </Popover.Header>
      <Popover.Body>
        And here's some <strong>amazing</strong> content. It's very engaging.
        right?
      </Popover.Body>
    </Popover>
  );
  
  return (
    <>
      <span
        style={{ color: "#edee02", textShadow: "0px 0px 15px #edee02" }}
      ></span>
      <div className="introcontainer">
        {/* <h3>ABOUT THE GAME</h3> */}
        {/* <figure> */}
        <div ref={popoverRef}>
          <OverlayTrigger
            trigger="click"
            placement="auto"
            overlay={popoverContent}
            show={popoverOpen}
            onToggle={handlePopoverOpen}
          >
            <img
              src={ronnyai}
              style={{ float: "right", height: "160px", cursor: "help" }}
              alt="The robot Professor Han Fastolfe"
              title="Professor Han Fastolfe"
              onClick={() => setPopoverOpen(!popoverOpen)}
            />
          </OverlayTrigger>
        </div>
        {popoverOpen && (
          <div className="overlay-effect" onClick={handlePopoverClose} />
        )}
        {/* </figure> */}
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
          <div ref={popoverRef}>
          <OverlayTrigger
            trigger="click"
            placement="auto"
            overlay={popoverContent}
            show={popoverOpen2}
            onToggle={handlePopoverOpen2}
          >
          <img
            src={artsy}
            style={{ height: "123px", cursor: "pointer" }}
            title="Artsy"
            alt="The robot Artsy"
            />
            </OverlayTrigger>
        </div>
        </div>
      </div>
      <div style={{ marginTop: "43px" }}>
        <Link to="/hangman">
          <button id="introbtn">Play Hangman</button>
        </Link>
      </div>
    </>
  );
};

export default Intro;
