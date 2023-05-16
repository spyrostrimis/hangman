const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const User = require("../Models/usermodel")
// const verifyToken = require("../Middleware/auth");

let saltRounds = Number(process.env.SALTY_ROUNDS);

// SIGN UP
router.post("/user/signup", async (req, res) => {
  try {
      let { username, password } = req.body;
      console.log(username, password);
    if (!username || !password) {
      return res.send({ msg: "Both username and password are required" });
    }
      let userFound = await User.findOne({ username });
      console.log("userFound", userFound);
    if (userFound) {
      return res.send({ msg: "Username already exists" });
    } else {
      // Validate password requirements
    //   let passwordRegex =
    //     /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[^\w\s]).{6,}$/;
    //   if (!passwordRegex.test(password)) {
    //     return res.send({
    //       msg: "Password must be at least 6 characters long, contain at least one uppercase letter, one lowercase letter, one digit, and one symbol.",
    //     });
    //     }
        
      let hashedPassword = await bcrypt.hash(password, saltRounds);

      let newUser = await User.create({
        username,
        password: hashedPassword,
      });
    //   console.log("Registered successfully. Welcome!", newUser);
      let token = jwt.sign(
        { userId: newUser._id, username: newUser.username },
        process.env.TOKEN_PRIVATE_KEY
      );
      return res.send(token);
    }
  } catch (error) {
    res
      .status(500)
      .json({ msg: "Cannot register. Please try again later.", error });
  }
});

// LOGIN
router.post("/user/login", async (req, res) => {
  try {
    let { username, password } = req.body;
    if (!username || !password) {
      return res.send({ msg: "Both username and password are required" });
    }
    let userFound = await User.findOne({ username });
    if (!userFound) {
      return res.send({ msg: "Invalid username" });
    } else {
      let validatePassword = await bcrypt.compare(password, userFound.password);
      if (!validatePassword) {
        return res.send({ msg: "Incorrect password" });
      }
      let token = jwt.sign(
        { userId: userFound._id, username: userFound.username },
        process.env.TOKEN_PRIVATE_KEY
      );
      return res.send(token);
    }
  } catch (error) {
    res.status(500).send({ msg: "Cannot login, try later", error });
  }
});

// HALL OF FAME
router.get("/user/get-best-scores", async (req, res) => {
  try {
    // const allusers = await User.find({ score: { $gte: 1 } }); -> at least score 1
    const allusers = await User.find().sort({ score: -1 });
    const sortedUsers = allusers.map((user) => ({
      // Remove the password field from each user object
      // _id: user._id,
      username: user.username,
      score: user.score,
    }));
    res.send(sortedUsers);
  } catch (error) {
    res.send(error);
  }
});

// ADD 100 points to Winner
router.put("/user/add100", async (req, res) => {
  const userId = "6462e690ed214bf3f99fb03a";

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send("User not found");
    }

    const newScore = user.score + 100;

    await User.findByIdAndUpdate(userId, { score: newScore });
    res.send("Score updated successfully");
  } catch (error) {
    res.status(500).send("Error updating score");
  }
});



module.exports = router;