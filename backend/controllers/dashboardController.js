const {
  fetchIssuesForAuthority,
  fetchIssueById,
  updateIssueStatus: updateIssueStatusService,
  assignIssue: assignIssueService,
  buildDashboardStats,
  buildDepartmentStats,
} = require("../services/issueService");
const { resolveGpsLocation, verifyResolutionLocation } = require("../services/gpsService");
const { reverseGeocode, buildCoordinateFallbackAddress } = require("../services/geocodingService");
const { validateStoredImage, removeUploadedFile } = require("../services/imageValidationService");
const Issue = require("../models/issueModel");

const getAllIssues = async (req, res) => {
  try {
    const issues = await fetchIssuesForAuthority(req.user);

    res.json({
      count: issues.length,
      issues,
    });
  } catch (error) {
    console.error("Get all issues error:", error);

    res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Server error while fetching issues",
    });
  }
};

const getIssueById = async (req, res) => {
  try {
    const issue = await fetchIssueById(req.params.id, req.user);

    if (!issue) {
      return res.status(404).json({
        message: "Issue not found",
      });
    }

    res.json({ issue });
  } catch (error) {
    console.error("Get issue by id error:", error);

    res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Server error while fetching issue",
    });
  }
};

const getIssuesByStatus = async (req, res) => {
  try {
    const issues = await fetchIssuesForAuthority(req.user, { status: req.params.status });

    res.json({
      count: issues.length,
      issues,
    });
  } catch (error) {
    console.error("Get issues by status error:", error);

    res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Server error while fetching issues",
    });
  }
};

const getIssuesByCategory = async (req, res) => {
  try {
    const issues = await fetchIssuesForAuthority(req.user, { category: req.params.category });

    res.json({
      count: issues.length,
      issues,
    });
  } catch (error) {
    console.error("Get issues by category error:", error);

    res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Server error while fetching issues",
    });
  }
};

const getIssuesByDepartment = async (req, res) => {
  try {
    const issues = await fetchIssuesForAuthority(req.user, { department: req.params.department });

    res.json({
      count: issues.length,
      issues,
    });
  } catch (error) {
    console.error("Get issues by department error:", error);

    res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Server error while fetching issues",
    });
  }
};

const updateIssueStatus = async (req, res) => {
  try {
    const completionProofPath = req.file ? `/uploads/${req.file.filename}` : undefined;
    let completionProofLocation;

    if (req.file) {
      // Reuse the exact same validation used for citizen report images so
      // the "Resolution Evidence" upload can't smuggle in a non-image file
      // just because it arrives on a different route.
      await validateStoredImage(req.file.path);

      // Same GPS priority as citizen reports: EXIF GPS embedded in the
      // evidence photo wins; the authority's current browser/device GPS
      // (sent alongside the upload) is only a fallback; otherwise we
      // gracefully record "location unavailable" rather than blocking the
      // status update - the evidence image itself is still valuable
      // without a location.
      const gpsData = await resolveGpsLocation(req.body, req.file.path);

      let address = null;
      if (gpsData.hasGps) {
        // A GPS-Map-Camera-style stamp already prints its own address next
        // to the coordinates (see gpsService.extractGpsFromImageStamp) -
        // prefer that over reverse geocoding the same coordinates.
        address = gpsData.address || null;
        if (!address) {
          address = await reverseGeocode(gpsData.latitude, gpsData.longitude);
        }
        if (!address) {
          address = buildCoordinateFallbackAddress(gpsData.latitude, gpsData.longitude);
        }
      }

      // Compare against the ORIGINAL citizen coordinates already persisted
      // on this issue (never a freshly-computed browser location) to see
      // whether the resolution photo was actually taken near the reported
      // problem. This never substitutes/adjusts either coordinate pair -
      // both remain exactly as resolved by resolveGpsLocation - it only
      // adds an informational verified/distance flag alongside them.
      let verification = { verified: null, distanceMeters: null, message: null };
      if (gpsData.hasGps) {
        const existingIssue = await Issue.findById(req.params.id).select("location");
        verification = verifyResolutionLocation(existingIssue?.location, {
          latitude: gpsData.latitude,
          longitude: gpsData.longitude,
        });
      }

      completionProofLocation = {
        latitude: gpsData.hasGps ? gpsData.latitude : null,
        longitude: gpsData.hasGps ? gpsData.longitude : null,
        address,
        source: gpsData.hasGps ? gpsData.source : "none",
        capturedAt: gpsData.hasGps ? gpsData.captureTimestamp || new Date() : null,
        verified: verification.verified,
        distanceMeters: verification.distanceMeters,
        verificationMessage: verification.message,
      };
    }

    const issue = await updateIssueStatusService(
      req.params.id,
      {
        status: req.body.status || undefined,
        remarks: req.body.remarks,
        completionProofPath,
        completionProofLocation,
      },
      req.user
    );

    res.json({
      message: "Issue status updated successfully",
      issue,
    });
  } catch (error) {
    console.error("Update issue status error:", error);

    await removeUploadedFile(req.file?.path);

    res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Server error while updating issue status",
    });
  }
};

const assignIssue = async (req, res) => {
  try {
    const issue = await assignIssueService(req.params.id, req.body.assignedTo || req.user._id, req.user);

    res.json({
      message: "Issue assigned successfully",
      issue,
    });
  } catch (error) {
    console.error("Assign issue error:", error);

    res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Server error while assigning issue",
    });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const issues = await fetchIssuesForAuthority(req.user);
    const stats = buildDashboardStats(issues);
    if (req.user.role === "administrator") {
      const User = require("../models/userModel");
      stats.totalUsers = await User.countDocuments();
      stats.citizens = await User.countDocuments({ role: "citizen" });
      stats.authorities = await User.countDocuments({ role: "authority" });
    }
    stats.department = req.user.role === "authority" ? req.user.department : undefined;

    res.json(stats);
  } catch (error) {
    console.error("Get dashboard stats error:", error);

    res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Server error while fetching dashboard stats",
    });
  }
};

const getRecentIssues = async (req, res) => {
  try {
    const issues = await fetchIssuesForAuthority(req.user);

    res.json({
      count: issues.slice(0, 10).length,
      issues: issues.slice(0, 10),
    });
  } catch (error) {
    console.error("Get recent issues error:", error);

    res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Server error while fetching recent issues",
    });
  }
};

const getDepartmentSummary = async (req, res) => {
  try {
    const issues = await fetchIssuesForAuthority(req.user);
    const departments = buildDepartmentStats(issues);

    res.json({ departments });
  } catch (error) {
    console.error("Get department summary error:", error);

    res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Server error while fetching department summary",
    });
  }
};

// Real notifications derived from each issue's own statusHistory (no
// separate notification model/fabricated data) - every status change,
// remark, or completion-proof upload already recorded in Module 2's
// statusHistory becomes one notification, scoped to exactly the issues this
// user can already see (citizen: their own reports; authority: their
// department; administrator: everything) via the same fetchIssuesForAuthority
// used everywhere else in this file.
const getNotifications = async (req, res) => {
  try {
    const issues = await fetchIssuesForAuthority(req.user);

    const notifications = issues
      .flatMap((issue) =>
        (issue.statusHistory || []).map((entry) => ({
          id: `${issue._id}-${entry.changedAt?.toISOString?.() || entry.changedAt}-${entry.status}`,
          issueId: issue._id,
          issueTitle: issue.title,
          status: entry.status,
          remarks: entry.remarks || "",
          hasCompletionProof: Boolean(entry.completionProof),
          changedBy: entry.changedBy?.name || null,
          changedAt: entry.changedAt,
        }))
      )
      .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt))
      .slice(0, 30);

    res.json({ count: notifications.length, notifications });
  } catch (error) {
    console.error("Get notifications error:", error);

    res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Server error while fetching notifications",
    });
  }
};

module.exports = {
  getAllIssues,
  getIssueById,
  getIssuesByStatus,
  getIssuesByCategory,
  getIssuesByDepartment,
  updateIssueStatus,
  assignIssue,
  getDashboardStats,
  getRecentIssues,
  getDepartmentSummary,
  getNotifications,
};
