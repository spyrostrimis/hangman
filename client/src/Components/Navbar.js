import React from 'react'
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import jwt_decode from "jwt-decode";
import logoo from "../Images/logoo.png";

const Navbar = () => {
  let token = localStorage.getItem("token");
  const navigate = useNavigate();
  let decoded;

  if (token) {
    try {
      decoded = jwt_decode(token);
    } catch (error) {
      localStorage.removeItem("token");
      navigate("/login");
    }
  }

  function logout() {
    localStorage.removeItem("token");
  }

  return (
    <div className="navbarcustom">
      {/* <nav>
        <Link to="/hangman">
          <img src={logoo} style={{ height: "36px" }} />
        </Link>
      </nav> */}
      <nav>
        <Link to="/">HOMEWORLD</Link>
      </nav>
      <nav>
        {token ? (
          <>
            {/* <Link to="#">{decoded ? decoded.username : null}</Link> */}
            <Link to="/hangman">Play Hangman</Link>
            <Link to="/hall-of-fame">Hall of Fame</Link>
            <Link onClick={logout} to="/login">
              Logout
            </Link>
          </>
        ) : (
          <>
            <Link to="/hangman">Play Hangman</Link>
            <Link to="/hall-of-fame">Hall of Fame</Link>
            <Link to="/login">Sign In</Link>
            {/* <Link to="/signup">Signup</Link> */}
          </>
        )}
      </nav>
    </div>
  );
}

export default Navbar