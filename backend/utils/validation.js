const mongoose = require("mongoose");

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;
const MIN_PASSWORD_LENGTH = 6;
const MIN_NAME_LENGTH = 2;

function isValidEmail(email) {
  return typeof email === "string" && EMAIL_REGEX.test(email.trim());
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function isValidPassword(password) {
  return typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH;
}

function isValidName(name) {
  return typeof name === "string" && name.trim().length >= MIN_NAME_LENGTH;
}

function isValidMongoId(value) {
  return mongoose.isValidObjectId(value);
}

module.exports = {
  EMAIL_REGEX,
  MIN_PASSWORD_LENGTH,
  MIN_NAME_LENGTH,
  isValidEmail,
  normalizeEmail,
  isValidPassword,
  isValidName,
  isValidMongoId,
};
