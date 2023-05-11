import React from 'react'

const HEAD = (
  <div
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

const Figure = ({ incorrectGuesses }) => {
  return (
    <div style={{ position: "relative" }}>
      {/* <h1>Figure</h1> */}
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
    </div>
  );
};

export default Figure