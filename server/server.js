const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const mongoose = require("mongoose");

const port = 8000 || process.env.port;
const URI = process.env.MONGODB_URI;



app.use((req, res, next) => {
  res.set({
    "Access-Control-Allow-Origin": "https://hengman.vercel.app",
    "Access-Control-Allow-Methods": "*",
    "Access-Control-Allow-Headers":
      "Access-Control-Allow-Headers: Origin, Content-Type, X-Auth-Token",
  });

  next();
});

app.use(cors());

main()
    .then(() => console.log("Database connected!"))
    .catch((err) => console.log(err));

async function main() {
    await mongoose.connect(URI);
}

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
    console.log(`Hangman listening on port ${port}`);
})