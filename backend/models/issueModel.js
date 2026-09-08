const mongoose = require("mongoose");
const { CATEGORIES, DEPARTMENTS, STATUSES } = require("../constants/issueCategories");

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: STATUSES,
      required: true,
    },

    remarks: {
      type: String,
      trim: true,
      default: "",
    },

    completionProof: {
      type: String,
      default: null,
    },

    // GPS/location captured for this status entry's completion-proof
    // image (authority resolution evidence), mirroring the shape of the
    // top-level `location` field used for the citizen's original report.
    // Only populated when a completionProof image was attached to this
    // particular status change.
    completionProofLocation: {
      type: {
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null },
        address: { type: String, default: null },
        source: {
          type: String,
          enum: ["exif", "browser", "none"],
          default: "none",
        },
        capturedAt: { type: Date, default: null },
        // Whether this resolution-evidence location falls within
        // ALLOWED_RESOLUTION_RADIUS_METERS of the original issue location
        // (see gpsService.verifyResolutionLocation). null when either
        // coordinate pair was unavailable to compare; never used to alter
        // either coordinate pair itself.
        verified: { type: Boolean, default: null },
        distanceMeters: { type: Number, default: null },
        verificationMessage: { type: String, default: null },
      },
      default: null,
      _id: false,
    },

    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    changedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const issueSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      enum: CATEGORIES,
      required: true,
    },

    location: {
      address: {
        type: String,
        required: true,
      },

      latitude: {
        type: Number,
        required: true,
        min: -90,
        max: 90,
      },

      longitude: {
        type: Number,
        required: true,
        min: -180,
        max: 180,
      },

      accuracy: {
        type: Number,
        default: null,
      },

      captureTimestamp: {
        type: Date,
        default: null,
      },

      source: {
        type: String,
        enum: ["browser", "exif", "none"],
        default: "browser",
      },
    },

    image: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: STATUSES,
      default: "Pending",
    },

    priority: {
      type: String,
      enum: [
        "Low",
        "Medium",
        "High",
        "Critical",
      ],
      default: "Medium",
    },

    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    assignedDepartment: {
      type: String,
      enum: DEPARTMENTS,
      required: true,
    },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    aiPrediction: {
      category: {
        type: String,
        enum: CATEGORIES,
        required: true,
      },

      confidence: {
        type: Number,
        required: true,
        min: 0,
        max: 1,
      },

      modelVersion: {
        type: String,
        required: true,
      },

      predictedAt: {
        type: Date,
        required: true,
      },
    },

    // Authority resolution-evidence image ("Resolution Evidence" /
    // "Before/After Resolution Image"). Stored separately from the
    // citizen's original `image` and never overwrites it - mirrors
    // `completionProof` (kept for backward compatibility with existing
    // status-update workflow) but is the field new frontend code reads to
    // avoid ambiguity about what it represents.
    resolutionEvidence: {
      type: String,
      default: null,
    },

    // GPS/location resolved for the *current/latest* resolution evidence
    // image (EXIF GPS from the image takes priority over the authority's
    // browser GPS at time of upload; see gpsService.resolveGpsLocation).
    completionProofLocation: {
      type: {
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null },
        address: { type: String, default: null },
        source: {
          type: String,
          enum: ["exif", "browser", "none"],
          default: "none",
        },
        capturedAt: { type: Date, default: null },
        // Whether this resolution-evidence location falls within
        // ALLOWED_RESOLUTION_RADIUS_METERS of the original issue location
        // (see gpsService.verifyResolutionLocation). null when either
        // coordinate pair was unavailable to compare; never used to alter
        // either coordinate pair itself.
        verified: { type: Boolean, default: null },
        distanceMeters: { type: Number, default: null },
        verificationMessage: { type: String, default: null },
      },
      default: null,
      _id: false,
    },

    // Most recent remark left by an authority/admin, kept for quick access
    // (e.g. list views) in addition to the full per-entry remarks kept in
    // statusHistory below.
    remarks: {
      type: String,
      trim: true,
      default: "",
    },

    // Path to a proof-of-completion image uploaded by the authority
    // (e.g. "/uploads/1699999999-123456789.jpg"), mirroring how `image` is
    // stored for the citizen's original report photo.
    completionProof: {
      type: String,
      default: null,
    },

    resolvedAt: {
      type: Date,
      default: null,
    },

    // Last user (authority or administrator) who modified this issue after
    // creation - distinct from `assignedTo`, which tracks who owns the issue.
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Full, append-only audit trail of every status change from creation
    // through resolution. Powers the citizen-facing tracking timeline.
    statusHistory: {
      type: [statusHistorySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

issueSchema.index({ status: 1, createdAt: -1 });
issueSchema.index({ category: 1, createdAt: -1 });
issueSchema.index({ assignedDepartment: 1, createdAt: -1 });
issueSchema.index({ reportedBy: 1, createdAt: -1 });

module.exports = mongoose.model("Issue", issueSchema);
