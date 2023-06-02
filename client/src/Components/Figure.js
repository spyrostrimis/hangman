import React from 'react'
import { useEffect } from "react";
import artsy from "../Images/artsy.png";
import defaultpainting from "../Images/painting.webp"
import gameover from "../Images/gameover.png";

const HEAD = (
  <div
    key="head"
    style={{
      height: "40px",
      width: "40px",
      borderRadius: "100%",
      border: "solid 10px black",
      position: "absolute",
      top: "50px",
      right: "-25px",
    }}
  ></div>
);

const BODY = (
  <div
    key="body"
    style={{
      height: "110px",
      width: "10px",
      backgroundColor: "black",
      position: "absolute",
      top: "110px",
      right: 0,
    }}
  ></div>
);

const LEFT_ARM = (
  <div
    key="leftarm"
    style={{
      height: "10px",
      width: "100px",
      backgroundColor: "black",
      position: "absolute",
      top: "140px",
      right: "7px",
      rotate: "14deg",
      // transformOrigin: "right bottom",
    }}
  ></div>
);

const RIGHT_ARM = (
  <div
    key="rightarm"
    style={{
      height: "10px",
      width: "112px",
      backgroundColor: "black",
      position: "absolute",
      top: "125px",
      right: "-102px",
      rotate: "330deg",
    }}
  ></div>
);

const LEFT_LEG = (
  <div
    key="leftleg"
    style={{
      height: "120px",
      width: "10px",
      backgroundColor: "black",
      position: "absolute",
      top: "220px",
      right: "1px",
      rotate: "20deg",
      transformOrigin: "right top",
    }}
  ></div>
);

const RIGHT_LEG = (
  <div
    key="rightleg"
    style={{
      height: "128px",
      width: "10px",
      backgroundColor: "black",
      position: "absolute",
      top: "219px",
      right: 0,
      rotate: "-20deg",
      transformOrigin: "right top",
    }}
  ></div>
);

const BODY_PARTS = [HEAD,BODY,LEFT_ARM,RIGHT_ARM,LEFT_LEG,RIGHT_LEG];

const Figure = ({ painting, Winner = false, Loser = false }) => {
  // console.log(painting);
  useEffect(() => {
    // Add a class to the body element when the component mounts
    document.body.classList.add("figure-body");

    // Remove the class from the body element when the component unmounts
    return () => {
      document.body.classList.remove("figure-body");
    };
  }, []);

  // useEffect(() => {
  //   setRemaining();
  // }, [incorrectGuesses]);

  return (
    <div className="figurecontainer">
      <div className="figurescreen">
        <div
          className="figurescreeninner"
          style={
            Winner
              ? painting
                ? { backgroundImage: `url(${painting})` }
                : { backgroundImage: `url(${defaultpainting})` }
              : Loser
              ? { backgroundImage: `url(${gameover})` }
              : null
          }
        >
          {/* <div style={{ position: "relative" }}>
      {BODY_PARTS.slice(0, incorrectGuesses)}
      <div
        style={{
          height: "40px",
          width: "10px",
          backgroundColor: "black",
          position: "absolute",
          top: "10px",
          right: 0,
        }}
      ></div>
      <div
        style={{
          height: "10px",
          width: "200px",
          backgroundColor: "black",
          marginLeft: "120px",
        }}
      ></div>
      <div
        style={{
          height: "400px",
          width: "10px",
          backgroundColor: "black",
          marginLeft: "120px",
        }}
      ></div>
      <div
        style={{ height: "10px", width: "250px", backgroundColor: "black" }}
      ></div>
        </div> */}
        </div>
      </div>
      <div className={`figureartsy ${Winner ? "winner" : ""}`}>
        <img
          src={artsy}
          alt={`painting by ChatGPT`}
          title={`painting by ChatGPT`}
          width={250}
        />
      </div>
    </div>
  );
};

export default Figure