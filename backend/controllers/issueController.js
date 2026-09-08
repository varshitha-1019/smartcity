const Issue = require("../models/issueModel");
const { predictImage } = require("../services/aiService");
const { getDepartment } = require("../services/departmentService");
const {
  reverseGeocode,
  buildCoordinateFallbackAddress,
  normalizeCategory,
  generateTitle,
  generateDescription,
} = require("../services/geocodingService");
const { resolveGpsLocation } = require("../services/gpsService");
const { validateStoredImage, removeUploadedFile } = require("../services/imageValidationService");

// Best-effort, read-only preview of the location that will actually be used
// if this exact image (plus whatever browser GPS the client currently has)
// were submitted right now - used by the Report Issue form so the citizen
// sees the *real* resolved location (EXIF GPS from the uploaded file when
// present, browser GPS only as a fallback) before they submit, instead of
// always showing raw browser/device GPS regardless of the image's own
// metadata. Mirrors createIssue's GPS resolution (`resolveGpsLocation`)
// exactly, but never creates an Issue and always removes the temp upload
// afterward. The address that actually gets stored on the issue is still
// resolved independently inside createIssue itself.
function isNoisyAddress(str) {
  if (!str || typeof str !== "string") return true;
  const clean = str.trim();
  if (clean.length < 8) return true;
  if (/[§&|<>*•~`^¥]/.test(clean)) return true;
  if (/^id\s+pr/i.test(clean)) return true;
  if (/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun/i.test(clean)) return true;
  if (/GMT|UTC|\bAM\b|\bPM\b/i.test(clean)) return true;
  if (/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(clean)) return true;
  if (/\b\d{1,2}:\d{2}\b/.test(clean)) return true;
  if (/\b\d{1,3}\s*(?:°\s*[CcFf]?|00g[CcFf]|deg[CcFf]?)\b/i.test(clean)) return true;
  const words = clean.split(/\s+/).filter((w) => w.length >= 3 && /^[A-Za-z0-9]/.test(w));
  return words.length < 2;
}

const previewImageLocation = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "An image file is required." });
    }

    await validateStoredImage(req.file.path);

    const gpsData = await resolveGpsLocation(req.body, req.file.path);

    if (!gpsData.hasGps) {
      return res.json({
        hasGps: false,
        source: "none",
        latitude: null,
        longitude: null,
        accuracy: null,
        address: null,
      });
    }

    // A GPS-Map-Camera-style stamp already prints its own address text next
    // to the coordinates (see gpsService.extractGpsFromImageStamp) - that's
    // the address that actually belongs to the image, so it takes priority
    // over a reverse-geocode lookup, which may resolve the same coordinates
    // to a different nearby locality name.
    let address = gpsData.address || null;
    if (!address || isNoisyAddress(address)) {
      const geoAddress = await reverseGeocode(gpsData.latitude, gpsData.longitude);
      if (geoAddress) {
        address = geoAddress;
      }
    }
    if (!address) {
      address = buildCoordinateFallbackAddress(gpsData.latitude, gpsData.longitude);
    }

    res.json({
      hasGps: true,
      source: gpsData.source,
      latitude: gpsData.latitude,
      longitude: gpsData.longitude,
      accuracy: gpsData.accuracy ?? null,
      address,
    });
  } catch (error) {
    console.error("Preview image location error:", error);
    res.status(500).json({ message: "Server error while resolving image location" });
  } finally {
    await removeUploadedFile(req.file?.path);
  }
};

const previewPrediction = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "An image file is required for prediction." });
    }

    await validateStoredImage(req.file.path);
    const prediction = await predictImage(req.file.path);

    const department = prediction.category && prediction.category !== "Unknown"
      ? getDepartment(prediction.category)
      : null;

    res.json({
      success: true,
      prediction: {
        ...prediction,
        assignedDepartment: department,
      },
    });
  } catch (error) {
    console.error("Preview prediction error:", error);
    res.status(500).json({ message: error.message || "Server error while predicting image" });
  } finally {
    await removeUploadedFile(req.file?.path);
  }
};

// Best-effort, read-only reverse-geocoding preview used by the Report Issue
// form so the citizen can see the human-readable address (and confirm it
// looks right) before they submit the issue - the address that actually
// gets stored on the issue is still resolved independently inside
// createIssue itself. Kept server-side (rather than calling the geocoding
// provider directly from the browser) so any provider credentials stay out
// of frontend code and can be swapped/configured via environment variables
// in one place.
const previewLocation = async (req, res) => {
  try {
    const latitude = Number(req.query.latitude);
    const longitude = Number(req.query.longitude);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({ message: "Valid latitude and longitude query parameters are required." });
    }

    let address = await reverseGeocode(latitude, longitude);
    if (!address) {
      address = buildCoordinateFallbackAddress(latitude, longitude);
    }

    res.json({ address });
  } catch (error) {
    console.error("Preview geocode error:", error);
    res.status(500).json({ message: "Server error while resolving address" });
  }
};

const createIssue = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "An image file is required." });
    }

    const { priority } = req.body;
    await validateStoredImage(req.file.path);

    const gpsData = await resolveGpsLocation(req.body, req.file.path);
    if (!gpsData.hasGps) {
      return res.status(400).json({ message: gpsData.message || "Image must contain GPS metadata or browser location." });
    }

    const prediction = await predictImage(req.file.path);
    if (typeof prediction.confidence !== "number" || prediction.confidence < 0 || prediction.confidence > 1) {
      return res.status(422).json({ message: "AI confidence is invalid." });
    }

    // The AI layer (ai/scripts/predict.py + aiPredictionService.validatePrediction)
    // never forces an uncertain/irrelevant image into one of the four civic
    // categories - it returns status VALID/UNCERTAIN/REJECTED instead. Only a
    // VALID prediction may become an Issue; UNCERTAIN/REJECTED are reported
    // back to the citizen as-is (no issue is created, no fallback category is
    // invented) so they can retake/re-upload the photo.
    if (prediction.status !== "VALID") {
      await removeUploadedFile(req.file.path);
      return res.status(422).json({
        message: prediction.reason || "Invalid image category. Please upload an image related to Garbage, Drainage, Water Leakage, or Potholes.",
        aiStatus: prediction.status,
        isRelevant: prediction.isRelevant,
        confidence: prediction.confidence,
        category: "Unknown",
        topCategory: prediction.topCategory || null,
      });
    }

    const predictedCategory = normalizeCategory(prediction.category);
    const confidence = prediction.confidence;
    const assignedDepartment = getDepartment(predictedCategory);
    const title = generateTitle(predictedCategory);

    const resolvedLatitude = gpsData.latitude;
    const resolvedLongitude = gpsData.longitude;

    // The reverse-geocoding provider is a best-effort, third-party lookup.
    // If it's unavailable or returns nothing, fall back to a deterministic
    // address derived from the actual GPS coordinates rather than blocking
    // issue creation or inventing/reusing an unrelated place name. The real
    // coordinates are always stored in `location.latitude/longitude`
    // regardless of which address string is used.
    // A GPS-Map-Camera-style stamp already prints its own address text next
    // to the coordinates (see gpsService.extractGpsFromImageStamp) - prefer
    // that over reverse geocoding, since it's the address the image itself
    // actually shows, not just whatever nearby locality name a geocoding
    // provider happens to resolve those coordinates to.
    let resolvedAddress = (req.body.address && !isNoisyAddress(req.body.address))
      ? req.body.address.trim()
      : (gpsData.address || null);
    if (!resolvedAddress || isNoisyAddress(resolvedAddress)) {
      const geoAddress = await reverseGeocode(resolvedLatitude, resolvedLongitude);
      if (geoAddress) {
        resolvedAddress = geoAddress;
      }
    }
    if (!resolvedAddress) {
      console.error("Reverse geocoding unavailable - falling back to coordinate-based address.");
      resolvedAddress = buildCoordinateFallbackAddress(resolvedLatitude, resolvedLongitude);
    }

    const descriptionText = generateDescription(predictedCategory, resolvedAddress);

    const issue = await Issue.create({
      title,
      description: descriptionText,
      category: predictedCategory,
      location: {
        address: resolvedAddress,
        latitude: resolvedLatitude,
        longitude: resolvedLongitude,
        accuracy: gpsData.accuracy ?? null,
        captureTimestamp: gpsData.captureTimestamp ?? null,
      },
      image: `/uploads/${req.file.filename}`,
      status: "Pending",
      priority: priority || "Medium",
      reportedBy: req.user._id,
      assignedDepartment,
      aiPrediction: {
        category: predictedCategory,
        confidence,
        modelVersion: prediction.modelVersion,
        predictedAt: new Date(),
      },
      statusHistory: [
        {
          status: "Pending",
          remarks: "",
          completionProof: null,
          changedBy: req.user._id,
          changedAt: new Date(),
        },
      ],
    });

    res.status(201).json({
      message: "Issue reported successfully",
      issue,
      predictedCategory,
      confidence,
      department: assignedDepartment,
      address: issue.location.address,
    });
  } catch (error) {
    console.error("========== CREATE ISSUE ERROR ==========", error);

    await removeUploadedFile(req.file?.path);

    if (error.statusCode === 502) {
      return res.status(502).json({ message: error.message });
    }

    if (error.message?.includes("AI prediction") || error.message?.includes("Unsupported AI category")) {
      return res.status(422).json({ message: error.message });
    }

    if (error.message?.includes("GPS") || error.message?.includes("geo-tagged") || error.message?.includes("image") || error.message?.includes("Image")) {
      return res.status(400).json({ message: error.message });
    }

    res.status(500).json({ message: "Server error while creating issue" });
  }
};

const getMyIssues = async (req, res) => {
  try {

    const issues = await Issue.find({
      reportedBy: req.user._id,
    }).sort({ createdAt: -1 });

    res.json({
      count: issues.length,
      issues,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Server error while fetching issues",
    });

  }
};

const getAllIssues = async (req, res) => {
  try {

    const issues = await Issue.find()
      .populate("reportedBy", "name email")
      .populate("assignedTo", "name email")
      .sort({ createdAt: -1 });

    res.json({
      count: issues.length,
      issues,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Server error while fetching all issues",
    });

  }
};

// Note: status updates for issues are handled by dashboardController's
// updateIssueStatus (backed by issueService), which enforces role-based
// authorization, valid status transitions, and the remarks/completion-proof
// workflow. That is the version wired up in routes/issueRoutes.js.

module.exports = {
  createIssue,
  getMyIssues,
  getAllIssues,
  previewLocation,
  previewImageLocation,
  previewPrediction,
};
