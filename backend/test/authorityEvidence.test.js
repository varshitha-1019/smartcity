const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const Issue = require("../models/issueModel");
const { updateIssueStatus } = require("../services/issueService");
const { resolveGpsLocation, stopTesseractWorker } = require("../services/gpsService");
const { authorize } = require("../middleware/authMiddleware");
const dashboardController = require("../controllers/dashboardController");

test.after(async () => {
  await stopTesseractWorker();
});

const geoTaggedImage = path.resolve(__dirname, "fixtures/vadlamudi-geotagged.jpg");
const plainImage = path.resolve(__dirname, "../../ai/test_images/pothole.jpg");

function makeMockIssue(overrides = {}) {
  const issue = {
    _id: new (require("mongoose").Types.ObjectId)().toString(),
    status: "In Progress",
    assignedDepartment: "Pothole",
    assignedTo: "authority-1",
    image: "/uploads/original-citizen-photo.jpg",
    statusHistory: [],
    remarks: "",
    completionProof: null,
    resolutionEvidence: null,
    completionProofLocation: null,
    resolvedAt: null,
    updatedBy: null,
    ...overrides,
  };
  issue.save = async () => issue;
  issue.populate = async () => issue;
  return issue;
}

function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

// --- 1 & 2: Authorization -------------------------------------------------

test("authorize() blocks a citizen from the authority-only status/evidence route", () => {
  const middleware = authorize("authority", "administrator");
  const req = { user: { role: "citizen" } };
  const res = makeRes();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test("updateIssueStatus rejects an authority who is not the assigned owner of the issue", async () => {
  const originalFindById = Issue.findById;
  const mockIssue = makeMockIssue({ assignedTo: "authority-owner" });

  try {
    Issue.findById = () => mockIssue;

    await assert.rejects(
      () =>
        updateIssueStatus(
          mockIssue._id,
          { completionProofPath: "/uploads/evidence.jpg" },
          { role: "authority", _id: "authority-intruder", department: "Pothole" }
        ),
      (error) => {
        assert.equal(error.statusCode, 403);
        return true;
      }
    );
  } finally {
    Issue.findById = originalFindById;
  }
});

test("updateIssueStatus allows an administrator to upload evidence even without being assignedTo", async () => {
  const originalFindById = Issue.findById;
  const mockIssue = makeMockIssue({ assignedTo: "authority-owner" });

  try {
    Issue.findById = () => mockIssue;

    const updated = await updateIssueStatus(
      mockIssue._id,
      { completionProofPath: "/uploads/evidence.jpg" },
      { role: "administrator", _id: "admin-1" }
    );

    assert.equal(updated.resolutionEvidence, "/uploads/evidence.jpg");
  } finally {
    Issue.findById = originalFindById;
  }
});

// --- 3: Evidence stored separately from original image ---------------------

test("evidence image is stored separately and never overwrites the original citizen image", async () => {
  const originalFindById = Issue.findById;
  const mockIssue = makeMockIssue({ image: "/uploads/citizen-original.jpg" });

  try {
    Issue.findById = () => mockIssue;

    const updated = await updateIssueStatus(
      mockIssue._id,
      { completionProofPath: "/uploads/authority-evidence.jpg" },
      { role: "authority", _id: "authority-1", department: "Pothole" }
    );

    assert.equal(updated.image, "/uploads/citizen-original.jpg");
    assert.equal(updated.completionProof, "/uploads/authority-evidence.jpg");
    assert.equal(updated.resolutionEvidence, "/uploads/authority-evidence.jpg");
    assert.notEqual(updated.image, updated.resolutionEvidence);
  } finally {
    Issue.findById = originalFindById;
  }
});

// --- 4 & 5: Evidence GPS extraction / EXIF priority -------------------------

test("evidence GPS extraction prefers EXIF GPS embedded in the resolution-evidence image over browser GPS", async () => {
  const browserBody = { latitude: "16.409002", longitude: "80.620844" };

  const result = await resolveGpsLocation(browserBody, geoTaggedImage);

  assert.equal(result.hasGps, true);
  assert.equal(result.source, "exif");
  assert.equal(result.latitude, 16.233144);
  assert.equal(result.longitude, 80.546237);
});

// --- 6: Browser GPS fallback -------------------------------------------------

test("evidence GPS falls back to the authority's browser GPS when the evidence image has no EXIF GPS", async () => {
  const browserBody = { latitude: "16.409002", longitude: "80.620844" };

  const result = await resolveGpsLocation(browserBody, plainImage);

  assert.equal(result.hasGps, true);
  assert.equal(result.source, "browser");
  assert.equal(result.latitude, 16.409002);
  assert.equal(result.longitude, 80.620844);
});

// --- 7: Graceful handling when GPS is unavailable ---------------------------

test("evidence GPS resolution degrades gracefully to 'unavailable' when neither EXIF nor browser GPS exist", async () => {
  const result = await resolveGpsLocation({}, plainImage);

  assert.equal(result.hasGps, false);
  assert.equal(result.latitude, null);
  assert.equal(result.longitude, null);
  assert.equal(result.source, "none");
  assert.ok(typeof result.message === "string" && result.message.length > 0);
});

test("updateIssueStatus persists a graceful 'none' completionProofLocation instead of fabricating coordinates", async () => {
  const originalFindById = Issue.findById;
  const mockIssue = makeMockIssue();

  try {
    Issue.findById = () => mockIssue;

    const gracefulLocation = {
      latitude: null,
      longitude: null,
      address: null,
      source: "none",
      capturedAt: null,
    };

    const updated = await updateIssueStatus(
      mockIssue._id,
      {
        completionProofPath: "/uploads/evidence-no-gps.jpg",
        completionProofLocation: gracefulLocation,
      },
      { role: "authority", _id: "authority-1", department: "Pothole" }
    );

    assert.deepEqual(updated.completionProofLocation, gracefulLocation);
    assert.equal(updated.statusHistory[0].completionProofLocation.source, "none");
  } finally {
    Issue.findById = originalFindById;
  }
});

// --- 8: Evidence retrieval by authorized citizen ----------------------------

test("resolution evidence fields are present on the issue document returned to the reporting citizen", async () => {
  const originalFindById = Issue.findById;
  const mockIssue = makeMockIssue({
    resolutionEvidence: "/uploads/authority-evidence.jpg",
    completionProofLocation: {
      latitude: 16.233144,
      longitude: 80.546237,
      address: "Vadlamudi, Andhra Pradesh, India",
      source: "exif",
      capturedAt: new Date(),
    },
  });

  try {
    Issue.findById = () => mockIssue;

    const updated = await updateIssueStatus(
      mockIssue._id,
      { remarks: "no-op remark to trigger a read-back" },
      { role: "authority", _id: "authority-1", department: "Pothole" }
    );

    // Citizens have read-only access - this just confirms the field the
    // citizen-facing UI reads is populated and correctly shaped.
    assert.equal(updated.resolutionEvidence, "/uploads/authority-evidence.jpg");
    assert.equal(updated.completionProofLocation.source, "exif");
  } finally {
    Issue.findById = originalFindById;
  }
});

// --- 9: Bounding-box feature has been fully removed --------------------
// The pothole bounding-box overlay feature was removed project-wide (no
// ai/scripts/pothole_bbox.py, no boundingBox field on aiPrediction, no
// overlay rendering). This test guards against it being reintroduced: an
// aiPrediction with a boundingBox-shaped payload should simply have that
// field dropped by the schema, not stored/validated as a real box.

test("issue schema has no aiPrediction.boundingBox field (bounding-box feature removed)", () => {
  const issue = new Issue({
    title: "Detected Pothole",
    description: "A pothole issue was detected.",
    category: "Pothole",
    location: { address: "Test", latitude: 16.5, longitude: 80.6, source: "exif" },
    image: "/uploads/test.jpg",
    reportedBy: new (require("mongoose").Types.ObjectId)(),
    assignedDepartment: "Pothole",
    aiPrediction: {
      category: "Pothole",
      confidence: 0.92,
      modelVersion: "urban_issue_classifier-v1",
      predictedAt: new Date(),
      // Even if something upstream still sent a bounding box, the schema
      // must not persist it.
      boundingBox: { x: 0.2, y: 0.3, width: 0.4, height: 0.25, unit: "normalized" },
    },
  });

  const validationError = issue.validateSync();
  assert.equal(validationError, undefined);
  assert.equal(issue.aiPrediction.boundingBox, undefined);
  assert.equal(issue.aiPrediction.toObject().boundingBox, undefined);
});

// --- 10: Existing workflow (status update without any evidence) is unaffected

test("updateIssueStatus without a file behaves exactly as before (no evidence fields touched)", async () => {
  const originalFindById = Issue.findById;
  const mockIssue = makeMockIssue({ status: "Assigned" });

  try {
    Issue.findById = () => mockIssue;

    const updated = await updateIssueStatus(
      mockIssue._id,
      { status: "In Progress", remarks: "Crew dispatched." },
      { role: "authority", _id: "authority-1", department: "Pothole" }
    );

    assert.equal(updated.status, "In Progress");
    assert.equal(updated.resolutionEvidence, null);
    assert.equal(updated.completionProofLocation, null);
  } finally {
    Issue.findById = originalFindById;
  }
});

test("dashboardController module still exports updateIssueStatus for the existing route wiring", () => {
  assert.equal(typeof dashboardController.updateIssueStatus, "function");
});
