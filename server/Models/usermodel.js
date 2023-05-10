const mongoose = require("mongoose");
// require("mongoose-type-email");
// mongoose.SchemaTypes.Email.defaults.message = "Email address is invalid";

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  name: { type: String },
  surname: { type: String },
//   email: { type: mongoose.SchemaTypes.Email, unique: true },
  role: { type: String },
    score: { type: Number },
  // default 0
  password: {
    type: String,
    required: true
    // match: /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[^\w\s]).{6,}$/,
    // Explanation of the regex pattern:
    // ^                 - Start of the string
    // (?=.*?[A-Z])      - Lookahead to assert at least one uppercase letter
    // (?=.*?[a-z])      - Lookahead to assert at least one lowercase letter
    // (?=.*?[0-9])      - Lookahead to assert at least one digit
    // (?=.*?[^\w\s])    - Lookahead to assert at least one symbol
    // .{6,}             - Match any character (except newline) at least 6 times
    // $                 - End of the string
  },
});

const User = mongoose.model("User", userSchema);

module.exports = User;

// mongoose-type-email may cause problems with OAUTH Google Sign Up