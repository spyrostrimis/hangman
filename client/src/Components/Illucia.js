import React from "react";
import { Link } from "react-router-dom";

const Illucia = () => {
  const token = localStorage.getItem("token");
  // if (token) {
  //   return <Navigate to="/" />;
  // }

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
