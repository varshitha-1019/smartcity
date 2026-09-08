const User = require("../models/userModel");
const { verifyToken } = require("../services/authService");

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Not authorized. Please login.",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = verifyToken(token);

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({
        message: "User no longer exists.",
      });
    }
    if (!user.active) {
      return res.status(403).json({ message: "This account is inactive." });
    }

    req.user = user;

    next();
  } catch (error) {
    console.error("Authentication error:", error.message);

    return res.status(401).json({
      message: "Invalid or expired token.",
    });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Access denied for this role.",
      });
    }

    next();
  };
};

module.exports = {
  protect,
  authorize,
};
