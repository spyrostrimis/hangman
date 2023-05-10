const mongoose = require("mongoose");

const wordSchema = new mongoose.Schema({
  spelling: { type: String, required: true },
  definition: String,
  example: String,
  hint: String,
  sound: String,
  pic: String
});

const Word = mongoose.model("Word", wordSchema);

module.exports = Word