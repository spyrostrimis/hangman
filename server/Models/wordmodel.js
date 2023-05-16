const mongoose = require("mongoose");

const wordSchema = new mongoose.Schema({
  word: { type: String, required: true, lowercase: true, trim: true },
  definition: String,
  example: String,
  explanation: String,
  hint: String,
  sound: String,
  image: String,
});

// Pre-save middleware to remove dot from the end of the word
wordSchema.pre("save", function (next) {
  if (this.word.endsWith(".")) {
    this.word = this.word.slice(0, -1);
  }
  next();
});

const Word = mongoose.model("Word", wordSchema);

module.exports = Word