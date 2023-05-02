const express = require("express");
const app = express();
require("dotenv").config();
const mongoose = require("mongoose");

const port = 8000 || process.env.port;
const URI = process.env.MONGODB_URI;

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