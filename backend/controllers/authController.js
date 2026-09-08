const User = require("../models/userModel");
const { isValidEmail, isValidPassword, isValidName, normalizeEmail } = require("../utils/validation");
const { generateToken, hashPassword, comparePassword } = require("../services/authService");

// Register
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({
        message: "Name, email and password are required",
      });
    }

    if (!isValidName(name) || !isValidEmail(normalizedEmail) || !isValidPassword(password)) {
      return res.status(400).json({ message: "Provide a valid name, email, and password of at least 6 characters." });
    }
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(409).json({
        message: "User already exists",
      });
    }

    // Public registration is always citizen-only; request body cannot escalate roles.

    const hashedPassword = await hashPassword(password);

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: "citizen",
      department: null,
    });

    const token = generateToken(user);

    res.status(201).json({
      message: "Registration successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);

    res.status(500).json({
      message: "Server error during registration",
    });
  }
};

// Login
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const passwordMatch = await comparePassword(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    // Deactivated accounts (authorities disabled by an administrator, most
    // commonly) must be stopped at login with a clear reason, rather than
    // being handed a token that then fails on every subsequent request via
    // the `protect` middleware's own active check.
    if (user.active === false) {
      return res.status(403).json({
        message: "This account has been deactivated. Contact an administrator.",
      });
    }

    const token = generateToken(user);

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      message: "Server error during login",
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
};
