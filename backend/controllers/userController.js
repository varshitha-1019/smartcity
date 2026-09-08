const User = require("../models/userModel");
const { isValidPassword } = require("../utils/validation");
const { hashPassword, comparePassword } = require("../services/authService");

// Returns the authenticated user's own profile. req.user is populated by the
// protect middleware (password already excluded via .select("-password")).
const getProfile = async (req, res) => {
  res.json({
    message: "Protected profile route accessed successfully",
    user: req.user,
  });
};

// Allows a logged-in user to update their own display name.
// Email/role/department are intentionally not editable here: email changes
// would need re-verification, and role/department escalation must stay
// restricted to the administrator-only endpoints in adminController.
const updateProfile = async (req, res) => {
  try {
    const { name } = req.body;

    if (typeof name !== "string" || name.trim().length < 2) {
      return res.status(400).json({ message: "Name must be at least 2 characters." });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.name = name.trim();
    await user.save();

    res.json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ message: "Server error while updating profile" });
  }
};

// Lets a logged-in user change their own password. Requires the current
// password, so a stolen/lingering session token alone can't be used to lock
// the real owner out - matches the same real-world requirement any account
// settings page needs.
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (typeof currentPassword !== "string" || !currentPassword) {
      return res.status(400).json({ message: "Current password is required." });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ message: "New password must be at least 6 characters." });
    }

    // req.user has -password excluded (set by authMiddleware.protect), so
    // re-fetch to actually get the hash to verify against - the schema
    // doesn't mark password as select:false, so a plain findById includes
    // it, same as authController.loginUser does.
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const matches = await comparePassword(currentPassword, user.password);
    if (!matches) {
      return res.status(401).json({ message: "Current password is incorrect." });
    }

    user.password = await hashPassword(newPassword);
    await user.save();

    res.json({ message: "Password updated successfully." });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ message: "Server error while changing password." });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
};
