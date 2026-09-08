const Issue = require("../models/issueModel");
const User = require("../models/userModel");
const {
  STATUSES: VALID_STATUSES,
  CATEGORIES: VALID_CATEGORIES,
  DEPARTMENTS: VALID_DEPARTMENTS,
  ALLOWED_STATUS_TRANSITIONS: ALLOWED_TRANSITIONS,
} = require("../constants/issueCategories");

function validateMongoId(value, label = "Issue") {
  if (!require("mongoose").isValidObjectId(value)) {
    const error = new Error(`${label} id is invalid`);
    error.statusCode = 400;
    throw error;
  }
}

function validateFilters(filters) {
  if (filters.status && !VALID_STATUSES.includes(filters.status)) {
    const error = new Error("Invalid issue status"); error.statusCode = 400; throw error;
  }
  if (filters.category && !VALID_CATEGORIES.includes(filters.category)) {
    const error = new Error("Invalid issue category"); error.statusCode = 400; throw error;
  }
  if (filters.department && !VALID_DEPARTMENTS.includes(filters.department)) {
    const error = new Error("Invalid department"); error.statusCode = 400; throw error;
  }
}

const buildDashboardStats = (issues = []) => {
  const stats = {
    totalIssues: issues.length,
    pending: 0,
    assigned: 0,
    inProgress: 0,
    resolved: 0,
    rejected: 0,
    // Preserved for backward compatibility with any existing consumers.
    potholes: 0,
    garbage: 0,
    drainage: 0,
    waterLeakage: 0,
    // Generic per-category breakdown covering every supported category,
    // including the ones added in Module 2.
    byCategory: {},
  };

  issues.forEach((issue) => {
    const status = issue.status || "Pending";
    const category = issue.category;

    if (status === "Pending") stats.pending += 1;
    if (status === "Assigned") stats.assigned += 1;
    if (status === "In Progress") stats.inProgress += 1;
    if (status === "Resolved") stats.resolved += 1;
    if (status === "Rejected") stats.rejected += 1;

    if (category === "Pothole") stats.potholes += 1;
    if (category === "Garbage") stats.garbage += 1;
    if (category === "Drainage") stats.drainage += 1;
    if (category === "Water Leakage") stats.waterLeakage += 1;

    if (category) {
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
    }
  });

  return stats;
};

const buildDepartmentStats = (issues = []) => {
  const counts = {};

  issues.forEach((issue) => {
    const department = issue.assignedDepartment;
    if (!department) return;
    counts[department] = (counts[department] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => b.count - a.count || a.department.localeCompare(b.department));
};

const fetchIssuesForAuthority = async (user, filters = {}) => {
  // Keep service usable by non-request callers while route handlers always pass a user.
  if (!user || typeof user !== "object" || !user.role) { filters = user || {}; user = { role: "administrator" }; }
  validateFilters(filters);
  const query = {};
  if (user.role === "authority") query.assignedDepartment = user.department;
  if (user.role === "citizen") query.reportedBy = user._id;

  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.category) {
    query.category = filters.category;
  }

  if (filters.department) {
    if (user.role === "authority" && filters.department !== user.department) {
      const error = new Error("Access denied for this department"); error.statusCode = 403; throw error;
    }
    query.assignedDepartment = filters.department;
  }

  return Issue.find(query)
    .populate("reportedBy", "name email role")
    .populate("assignedTo", "name email role")
    .populate("statusHistory.changedBy", "name email role")
    .populate("updatedBy", "name email role")
    .sort({ createdAt: -1 });
};

const fetchIssueById = async (issueId, user) => {
  validateMongoId(issueId);
  const issue = await Issue.findById(issueId)
    .populate("reportedBy", "name email role")
    .populate("assignedTo", "name email role")
    .populate("statusHistory.changedBy", "name email role")
    .populate("updatedBy", "name email role");

  if (!issue) {
    return null;
  }

  if (user.role === "authority" && issue.assignedDepartment !== user.department) {
    const error = new Error("Access denied for this department");
    error.statusCode = 403;
    throw error;
  }

  if (user.role === "citizen" && String(issue.reportedBy?._id || issue.reportedBy) !== String(user._id)) {
    const error = new Error("Access denied for this issue");
    error.statusCode = 403;
    throw error;
  }

  return issue;
};

/**
 * Update an issue's status and/or attach remarks / a completion-proof image.
 *
 * `updates` may include:
 *   - status: one of VALID_STATUSES (optional - omit to only add remarks/proof)
 *   - remarks: string (optional)
 *   - completionProofPath: string, e.g. "/uploads/xyz.jpg" (optional)
 *
 * Every call that actually changes something appends an entry to
 * statusHistory so the citizen can see a complete timeline.
 */
const updateIssueStatus = async (issueId, updates, user) => {
  validateMongoId(issueId);

  let status = typeof updates === "string" ? updates : updates?.status;
  if (status === "Completed") {
    status = "Resolved";
  }
  const remarks = typeof updates === "string" ? undefined : updates?.remarks;
  const completionProofPath = typeof updates === "string" ? undefined : updates?.completionProofPath;
  // Resolution-evidence GPS, e.g. { latitude, longitude, address, source, capturedAt }.
  // Only meaningful (and only ever set) alongside a new completionProofPath.
  const completionProofLocation = typeof updates === "string" ? undefined : updates?.completionProofLocation;

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    const error = new Error("Invalid issue status");
    error.statusCode = 400;
    throw error;
  }

  const issue = await Issue.findById(issueId);

  if (!issue) {
    const error = new Error("Issue not found");
    error.statusCode = 404;
    throw error;
  }

  if (user.role === "authority" && issue.assignedDepartment !== user.department) { const error = new Error("Access denied for this department"); error.statusCode = 403; throw error; }
  if (user.role === "authority" && (!issue.assignedTo || String(issue.assignedTo) !== String(user._id))) { const error = new Error("Only the assigned authority may update this issue"); error.statusCode = 403; throw error; }

  const statusChanged = status !== undefined && status !== issue.status;

  if (status !== undefined && statusChanged) {
    if (user.role !== "administrator" && !ALLOWED_TRANSITIONS[issue.status]?.includes(status)) {
      const error = new Error(`Invalid status transition from ${issue.status} to ${status}`);
      error.statusCode = 400;
      throw error;
    }
  }

  const hasRemarks = remarks !== undefined && remarks !== null && String(remarks).trim() !== "";
  const hasProof = Boolean(completionProofPath);

  if (!statusChanged && !hasRemarks && !hasProof) {
    // Nothing to update - keep this a no-op rather than writing an empty
    // history entry.
    return issue;
  }

  if (statusChanged) {
    issue.status = status;
    if (status === "Resolved") {
      issue.resolvedAt = new Date();
    }
  }

  if (hasRemarks) {
    issue.remarks = String(remarks).trim();
  }

  if (hasProof) {
    issue.completionProof = completionProofPath;
    // Kept in sync with `completionProof` so new frontend code has an
    // unambiguous field name while existing consumers of `completionProof`
    // keep working unchanged.
    issue.resolutionEvidence = completionProofPath;
    issue.completionProofLocation = completionProofLocation || null;
  }

  issue.updatedBy = user._id;

  issue.statusHistory.push({
    status: issue.status,
    remarks: hasRemarks ? String(remarks).trim() : "",
    completionProof: hasProof ? completionProofPath : null,
    completionProofLocation: hasProof ? completionProofLocation || null : null,
    changedBy: user._id,
    changedAt: new Date(),
  });

  await issue.save();

  await issue.populate([
    { path: "reportedBy", select: "name email role" },
    { path: "assignedTo", select: "name email role" },
    { path: "statusHistory.changedBy", select: "name email role" },
    { path: "updatedBy", select: "name email role" },
  ]);

  return issue;
};

const assignIssue = async (issueId, authorityUserId, assigningUser) => {
  validateMongoId(issueId);
  validateMongoId(authorityUserId, "Assignee");
  const issue = await Issue.findById(issueId);

  if (!issue) {
    const error = new Error("Issue not found");
    error.statusCode = 404;
    throw error;
  }

  const assignee = await User.findById(authorityUserId).select("role department active");
  if (!assignee || assignee.role !== "authority" || !assignee.active) {
    const error = new Error("Assignee must be an active authority user"); error.statusCode = 400; throw error;
  }
  if (assigningUser.role === "authority" && issue.assignedDepartment !== assigningUser.department) { const error = new Error("Access denied for this department"); error.statusCode = 403; throw error; }
  if (assigningUser.role === "authority" && String(authorityUserId) !== String(assigningUser._id)) {
    const error = new Error("Authorities may assign issues only to themselves"); error.statusCode = 403; throw error;
  }
  if (assignee.department !== issue.assignedDepartment) {
    const error = new Error("Assignee department does not match the issue department"); error.statusCode = 400; throw error;
  }
  if (!["Pending", "Assigned"].includes(issue.status)) {
    const error = new Error(`Issue cannot be assigned while status is ${issue.status}`); error.statusCode = 400; throw error;
  }
  issue.assignedTo = authorityUserId;
  issue.status = "Assigned";
  issue.updatedBy = assigningUser._id;
  issue.statusHistory.push({
    status: "Assigned",
    remarks: "",
    completionProof: null,
    changedBy: assigningUser._id,
    changedAt: new Date(),
  });
  await issue.save();

  await issue.populate([
    { path: "reportedBy", select: "name email role" },
    { path: "assignedTo", select: "name email role" },
    { path: "statusHistory.changedBy", select: "name email role" },
    { path: "updatedBy", select: "name email role" },
  ]);
  return issue;
};

module.exports = {
  buildDashboardStats,
  buildDepartmentStats,
  fetchIssuesForAuthority,
  fetchIssueById,
  updateIssueStatus,
  assignIssue,
  VALID_STATUSES,
};
