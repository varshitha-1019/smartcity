const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { getProfile, updateProfile, changePassword } = require("../controllers/userController");

const router = express.Router();

router.get("/profile", protect, getProfile);
router.patch("/profile", protect, updateProfile);
router.patch("/password", protect, changePassword);

module.exports = router;
