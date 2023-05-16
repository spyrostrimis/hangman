const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const mongoose = require("mongoose");

const userRouter = require("./Routers/userrouter");
const wordRouter = require("./Routers/wordrouter");
// const bodyParser = require("body-parser");

const port = 8000 || process.env.port;
const URI = process.env.MONGODB_URI;

app.use(cors());
app.use(express.json());
// app.use(bodyParser.json())



main()
    .then(() => console.log("Database connected!"))
    .catch((err) => console.log(err));

async function main() {
    await mongoose.connect(URI);
}

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.use("/", userRouter);
app.use("/", wordRouter);

app.listen(port, () => {
    console.log(`Hangman listening on port ${port}`);
})