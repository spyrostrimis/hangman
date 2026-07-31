import React from 'react'
import { useEffect, useState } from "react";
import axios from "axios";
import { MDBTable, MDBTableHead, MDBTableBody } from "mdb-react-ui-kit";
import { Link } from "react-router-dom";
import { Typewriter } from 'react-simple-typewriter'

const Halloffame = ({ Winner = false}) => {
  const [allusers, setAllusers] = useState([]);
  const token = localStorage.getItem("token");
  // if (token) {
  //   return <Navigate to="/" />;
  // }
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
      {!token && (
        <div className='hallheader'>
          <h4>Let's get competitive!</h4>
          <h4>
            <Link to="/login">Login</Link> or <Link to="/signup">Signup</Link>{" "}
            to earn points with each win, and claim your place into the Hall Of
            Fame.
          </h4>
        </div>
      )}
      <h1>HALL OF FAME</h1>
      <div className='halltable'>
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