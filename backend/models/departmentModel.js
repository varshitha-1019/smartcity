const mongoose = require("mongoose");
const { CATEGORIES } = require("../constants/issueCategories");

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
    },

    issueCategories: {
      type: [String],
      enum: CATEGORIES,
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Department", departmentSchema);