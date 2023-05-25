import React from 'react'
import { useEffect, useState } from "react";
import axios from "axios";
import { MDBTable, MDBTableHead, MDBTableBody } from "mdb-react-ui-kit";

const Halloffame = ({ Winner = false}) => {
  const [allusers, setAllusers] = useState([]);
  const [rank, setRank] = useState(0); // add key state

    useEffect(() => {
      // Add a class to the body element when the component mounts
      document.body.classList.add("hall-of-fame-body");

      // Remove the class from the body element when the component unmounts
      return () => {
        document.body.classList.remove("hall-of-fame-body");
      };
    }, []);

  async function getAllUsers() {
    let response = await axios.get(
      "http://localhost:8000/user/get-best-scores"
    );
    setAllusers(response.data);
  }

  useEffect(() => {
    getAllUsers();
  }, []);



  return (
    <div className="hallcontainer hall-of-fame">
      {/* <h1>HALL OF FAME</h1>
      <div className="hall">
        <ol>
          {allusers.map((user) => {
            return (
              <div key={user.username}>
                <li>
                  {user.username} : {user.score}
                </li>
              </div>
            );
          })}
        </ol>
      </div> */}
      {/* <main> */}
      <h1>HALL OF FAME</h1>
      <div role="region" aria-labelledby="Cap1" tabindex="0" style={{ fontSize: "2rem" }}>
        <table id="Books">
          <caption id="Cap1">Books I May or May Not Have Read</caption>
          <tr>
            <th style={{ textAlign: "right" }}>Rank</th>
            <th style={{ textAlign: "center", width: "480px" }}>Score</th>
            <th>Player</th>
          </tr>
          {allusers.map((user, index) => {
            return (
              <tr>
                <td>{index + 1}</td>
                <td>{user.score}</td>
                <td>{user.username}</td>
              </tr>
            );
          })}
        </table>
      </div>

      <p>
        Note that this is an <em>accessible</em> (keyboard and screen reader)
        responsive (width and print) table. You can{" "}
        <a href="http://adrianroselli.com/2017/11/a-responsive-accessible-table.html">
          read everything that went into the code in the tutorial
        </a>{" "}
        (so you can make your own).
      </p>
      {/* </main> */}
    </div>
  );
};

export default Halloffame