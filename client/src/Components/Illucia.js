import React from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const Illucia = () => {
  const token = localStorage.getItem("token");
  // if (token) {
  //   return <Navigate to="/" />;
  // }
  useEffect(() => {
    // Add a class to the body element when the component mounts
    document.body.classList.add("illucia-body");

    // Remove the class from the body element when the component unmounts
    return () => {
      document.body.classList.remove("illucia-body");
    };
  }, []);

  return (
    <div className="illucontainer">
      <div className="illuheader">
        <br />
        <h4>Coming Soon!</h4>
        <h4>
          Only for <Link to="/login">registered</Link> players
        </h4>
      </div>
    </div>
  );
};

export default Illucia;
