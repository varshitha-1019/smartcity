const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const jwtSecret = process.env.JWT_SECRET || "smart-city-secret";
const TOKEN_EXPIRY = "7d";
const SALT_ROUNDS = 10;

function generateToken(user) {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    jwtSecret,
    {
      expiresIn: TOKEN_EXPIRY,
    }
  );
}

function verifyToken(token) {
  return jwt.verify(token, jwtSecret);
}

function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = {
  jwtSecret,
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword,
};
