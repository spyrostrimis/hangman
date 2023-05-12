import React from 'react'
import { useRef } from "react";
import axios from "axios";
import { useNavigate, Navigate } from "react-router-dom";

function Signup() {
  const usernameRef = useRef();
  const passwordRef = useRef();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  if (token) {
    return <Navigate to="/" />;
  }

  async function createNewUser(e) {
    e.preventDefault();
    let newUser = {
      username: usernameRef.current.value,
      password: passwordRef.current.value,
    };
    let response = await axios.post("http://localhost:8000/user/signup", newUser);
    console.log(response);
    // catch an error from database
    if (response.data.msg) {
      alert(response.data.msg);
    }
    // after sign up, we navigate to the login page
    if (response) {
      localStorage.setItem("token", response.data);
      navigate("/");
    }
  }

  return (
    <div className="formcontainer">
      <div className="form">
        <form onSubmit={createNewUser}>
          <h1>Create account</h1>
          <label htmlFor="username"></label>
          <input
            id="username"
            type="text"
            ref={usernameRef}
            placeholder="Username"
            required
            maxLength="35"
            autoFocus
            pattern="[A-Za-z\d]{3,}"
            title="Username must be at least three characters, including numbers"
          />
          <br></br>
          <br></br>
          <label htmlFor="password"></label>
          <input
            id="password"
            type="text"
            ref={passwordRef}
            placeholder="Password"
            required
            maxLength="35"
            pattern=".{3,}"
            title="Password must be at least three characters"
          />
          <br />
          <br />
          <button type="submit">
            <span>Sign Up</span>
          </button>
          <br />
          <br />
          <span>
            Already have an account with us? Please <a href="/login">log in</a>
          </span>
        </form>
      </div>
    </div>
  );
}

export default Signup;