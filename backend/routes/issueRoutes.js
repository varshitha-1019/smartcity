const express = require("express");

const {
  createIssue,
  getMyIssues,
  previewLocation,
  previewImageLocation,
  previewPrediction,
} = require("../controllers/issueController");

const {
  getAllIssues,
  getIssueById,
  getIssuesByStatus,
  getIssuesByCategory,
  getIssuesByDepartment,
  updateIssueStatus,
  assignIssue,
} = require("../controllers/dashboardController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");

const upload = require("../middleware/uploadMiddleware");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Citizen Routes
|--------------------------------------------------------------------------
*/

// Report Issue (Camera / File Upload)
router.post(
  "/",
  protect,
  authorize("citizen"),
  upload.single("image"),
  createIssue
);

// Logged-in Citizen Issues
router.get(
  "/my",
  protect,
  authorize("citizen"),
  getMyIssues
);

// Live address preview for a set of coordinates, used by the Report Issue
// form to show the resolved address before the issue is actually submitted.
router.get(
  "/geocode/preview",
  protect,
  authorize("citizen"),
  previewLocation
);

// Live location preview for a just-selected image, used by the Report
// Issue form so the citizen sees the EXIF GPS from the uploaded file
// (falling back to browser GPS only when the image has none) before the
// issue is actually submitted - mirrors the same GPS priority createIssue
// enforces.
router.post(
  "/geocode/preview-image",
  protect,
  authorize("citizen"),
  upload.single("image"),
  previewImageLocation
);

// Instant AI prediction preview for an uploaded/selected photo
router.post(
  "/predict-preview",
  protect,
  authorize("citizen"),
  upload.single("image"),
  previewPrediction
);

/*
|--------------------------------------------------------------------------
| Authority & Administrator Routes
|--------------------------------------------------------------------------
*/

// All Issues
router.get(
  "/",
  protect,
  authorize("authority", "administrator"),
  getAllIssues
);

// Issue by Status
router.get(
  "/status/:status",
  protect,
  authorize("authority", "administrator"),
  getIssuesByStatus
);

// Issue by Category
router.get(
  "/category/:category",
  protect,
  authorize("authority", "administrator"),
  getIssuesByCategory
);

// Issue by Department
router.get(
  "/department/:department",
  protect,
  authorize("authority", "administrator"),
  getIssuesByDepartment
);

// Single Issue
router.get(
  "/:id",
  protect,
  authorize("citizen", "authority", "administrator"),
  getIssueById
);

// Update Issue Status (also accepts optional remarks + a completion-proof
// image). upload.single() only engages for multipart/form-data requests, so
// plain JSON `{ status }` requests continue to work unchanged.
router.patch(
  "/:id/status",
  protect,
  authorize("authority", "administrator"),
  upload.single("completionProof"),
  updateIssueStatus
);

// Assign Issue
// (Bug fix: authorities must be able to self-assign issues in their own
// department from the Authority Dashboard's "Assign To Me" action - the
// service layer already enforces that an authority may only assign to
// themselves within their own department, so this was incorrectly
// administrator-only.)
router.patch(
  "/:id/assign",
  protect,
  authorize("authority", "administrator"),
  assignIssue
);

module.exports = router;