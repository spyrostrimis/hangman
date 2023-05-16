import React from 'react'
import { useEffect, useState } from "react";
import axios from "axios";

const Halloffame = ({ Winner = false}) => {
  const [allusers, setAllusers] = useState([]);

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
    <div className="hallcontainer">
      <h1>HALL OF FAME</h1>
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
      </div>
    </div>
  );
};

export default Halloffame