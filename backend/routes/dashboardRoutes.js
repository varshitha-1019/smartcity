const express = require("express");

const {
  getDashboardStats,
  getRecentIssues,
  getDepartmentSummary,
  getNotifications,
} = require("../controllers/dashboardController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/stats", protect, authorize("authority", "administrator", "citizen"), getDashboardStats);
router.get("/recent", protect, authorize("authority", "administrator", "citizen"), getRecentIssues);
router.get("/departments", protect, authorize("authority", "administrator"), getDepartmentSummary);
router.get("/notifications", protect, authorize("authority", "administrator", "citizen"), getNotifications);

module.exports = router;
