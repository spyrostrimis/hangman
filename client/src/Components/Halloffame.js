import React from 'react'
import { useEffect, useState } from "react";
import axios from "axios";
import { MDBTable, MDBTableHead, MDBTableBody } from "mdb-react-ui-kit";

const Halloffame = ({ Winner = false}) => {
  const [allusers, setAllusers] = useState([]);

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
      <h1>HALL OF FAME</h1>
      <div style={{ fontSize: "2rem" }}>
        <table id="highscores">
          <thead>
            <tr>
              <th style={{ textAlign: "right" }}>Rank</th>
              <th style={{ textAlign: "center", width: "480px" }}>Score</th>
              <th>Player</th>
            </tr>
          </thead>
          <tbody>
            {allusers.map((user, index) => {
              return (
                <tr key={user.username}>
                  <td>{index + 1}</td>
                  <td>{user.score}</td>
                  <td>{user.username}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Halloffame