const mongoose = require("mongoose");
const { DEPARTMENTS } = require("../constants/issueCategories");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    role: {
      type: String,
      enum: ["citizen", "authority", "administrator"],
      default: "citizen",
    },

    department: {
      type: String,
      enum: DEPARTMENTS,
      default: null,
    },
    active: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);
