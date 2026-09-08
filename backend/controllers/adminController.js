const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/userModel");
const Issue = require("../models/issueModel");
const { DEPARTMENTS } = require("../constants/issueCategories");
const { isValidEmail, isValidPassword, normalizeEmail } = require("../utils/validation");

const safeUser = (user) => ({ id: user._id, name: user.name, email: user.email, role: user.role, department: user.department, active: user.active, createdAt: user.createdAt, updatedAt: user.updatedAt });

exports.createAuthority = async (req, res) => {
  const { name, email, password, department, active = true } = req.body;
  if (!name || !isValidEmail(email || "") || !isValidPassword(password) || !DEPARTMENTS.includes(department)) return res.status(400).json({ message: "Name, valid email, password (6+ characters), and valid department are required." });
  if (await User.findOne({ role: "authority", department })) return res.status(409).json({ message: "An authority already exists for this domain." });
  const normalizedEmail = normalizeEmail(email);
  if (await User.findOne({ email: normalizedEmail })) return res.status(409).json({ message: "User already exists" });
  const user = await User.create({ name: name.trim(), email: normalizedEmail, password: await bcrypt.hash(password, 10), role: "authority", department, active: Boolean(active) });
  res.status(201).json({ authority: safeUser(user) });
};
exports.listAuthorities = async (_req, res) => {
  const authorities = await User.find({ role: "authority" }).sort({ createdAt: -1 });

  const counts = await Issue.aggregate([
    { $match: { assignedTo: { $in: authorities.map((a) => a._id) } } },
    { $group: { _id: "$assignedTo", count: { $sum: 1 } } },
  ]);
  const countsByAuthority = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));

  res.json({
    authorities: authorities.map((user) => ({
      ...safeUser(user),
      assignedIssueCount: countsByAuthority[String(user._id)] || 0,
    })),
  });
};
exports.getAuthority = async (req, res) => { const user = await User.findOne({ _id: req.params.id, role: "authority" }); if (!user) return res.status(404).json({ message: "Authority not found" }); const assignedIssueCount = await Issue.countDocuments({ assignedTo: user._id }); res.json({ authority: { ...safeUser(user), assignedIssueCount } }); };
exports.updateAuthority = async (req, res) => { const user = await User.findOne({ _id: req.params.id, role: "authority" }); if (!user) return res.status(404).json({ message: "Authority not found" }); for (const key of ["name", "email", "department", "active"]) if (req.body[key] !== undefined) user[key] = req.body[key]; if (!DEPARTMENTS.includes(user.department)) return res.status(400).json({ message: "Invalid department" }); if (req.body.password) { if (!isValidPassword(req.body.password)) return res.status(400).json({ message: "Password must be at least 6 characters" }); user.password = await bcrypt.hash(req.body.password, 10); } await user.save(); res.json({ authority: safeUser(user) }); };
exports.updateAuthorityStatus = async (req, res) => { const user = await User.findOne({ _id: req.params.id, role: "authority" }); if (!user) return res.status(404).json({ message: "Authority not found" }); if (typeof req.body.active !== "boolean") return res.status(400).json({ message: "active must be a boolean" }); user.active = req.body.active; await user.save(); res.json({ authority: safeUser(user) }); };

// Administrator-only (enforced by adminRoutes.js's router-level
// `authorize("administrator")`). Deletes an authority account and safely
// unassigns any issues that were assigned to them, rather than leaving a
// dangling `assignedTo` reference or silently deleting the issues
// themselves. Unassigned issues revert to "Pending" (still correctly
// attached to their department) so an administrator or another authority in
// that department can pick them back up.
exports.deleteAuthority = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid authority id" });
  }

  const user = await User.findOne({ _id: id, role: "authority" });
  if (!user) return res.status(404).json({ message: "Authority not found" });

  const reassignResult = await Issue.updateMany(
    { assignedTo: user._id, status: { $in: ["Assigned", "In Progress"] } },
    { $set: { assignedTo: null, status: "Pending" } }
  );

  // Any issues left referencing this authority outside the active
  // statuses above (e.g. already Resolved/Rejected) just lose the
  // assignee reference so history stays intact without a broken link.
  await Issue.updateMany({ assignedTo: user._id }, { $set: { assignedTo: null } });

  await User.deleteOne({ _id: user._id });

  res.json({
    message: "Authority deleted",
    unassignedIssueCount: reassignResult.modifiedCount || 0,
  });
};
