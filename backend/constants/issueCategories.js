// Centralized category/department/status constants.
//
// Previously these lists were duplicated (and had drifted out of sync)
// across departmentService.js, geocodingService.js, issueService.js,
// issueModel.js, adminController.js, userModel.js and departmentModel.js.
// They are now defined once here and imported everywhere else.

// The platform is intentionally limited to the four AI-routable civic domains.
const CATEGORIES = ["Pothole", "Drainage", "Garbage", "Water Leakage"];

// The AI model (ai/model/urban_issue_classifier.keras) was trained on only
// four classes (ai/model/class_names.json: Drainage, Garbage, Pothole,
// Water_Leakage). It can only ever predict one of these categories.
// Automatic classification must never claim a category the model was not
// trained on - that would be a fake/dummy prediction.
const AI_SUPPORTED_CATEGORIES = ["Pothole", "Garbage", "Drainage", "Water Leakage"];

const DEPARTMENTS = ["Pothole", "Drainage", "Garbage", "Water Leakage"];

const CATEGORY_DEPARTMENT_MAP = {
  Pothole: "Pothole",
  Garbage: "Garbage",
  "Water Leakage": "Water Leakage",
  Drainage: "Drainage",
};

const AUTHORITY_EMAIL_MAP = {
  Garbage: "garbage.authority@smartcity.com",
  Drainage: "drainage.authority@smartcity.com",
  "Water Leakage": "water.authority@smartcity.com",
  Pothole: "pothole.authority@smartcity.com",
};

const STATUSES = ["Pending", "Assigned", "In Progress", "Resolved", "Rejected"];

const ALLOWED_STATUS_TRANSITIONS = {
  Pending: ["Assigned", "Rejected"],
  Assigned: ["Pending", "In Progress", "Rejected"],
  "In Progress": ["Assigned", "Resolved", "Rejected"],
  Resolved: [],
  Rejected: [],
};

module.exports = {
  CATEGORIES,
  AI_SUPPORTED_CATEGORIES,
  DEPARTMENTS,
  CATEGORY_DEPARTMENT_MAP,
  AUTHORITY_EMAIL_MAP,
  STATUSES,
  ALLOWED_STATUS_TRANSITIONS,
};
