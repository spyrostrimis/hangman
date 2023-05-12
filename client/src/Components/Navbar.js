import React from 'react'
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import jwt_decode from "jwt-decode";

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
    <div className="navbar">
      <nav>
        <Link to="/">Home</Link>
      </nav>
      <nav>
        {token ? (
          <>
            <Link to="#">{decoded ? decoded.username : null}</Link>
            <Link to="/savedmovies">Saved Movies</Link>
            <Link onClick={logout} to="/login">
              Logout
            </Link>
          </>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/signup">Signup</Link>
          </>
        )}
      </nav>
    </div>
  );
}

export default Navbar