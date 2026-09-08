const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const Issue = require("../models/issueModel");
const {
  haversineDistanceMeters,
  verifyResolutionLocation,
  getAllowedResolutionRadiusMeters,
} = require("../services/gpsService");

// Same-issue location verification (spec item #13): the authority is
// expected to be resolving the SAME physical location the citizen
// reported. This never substitutes/adjusts either coordinate pair - it
// only adds an informational verified/distance flag alongside the two
// authentic, independently-resolved coordinate pairs.

function makeMockIssue(overrides = {}) {
  const issue = {
    _id: new (require("mongoose").Types.ObjectId)().toString(),
    status: "In Progress",
    assignedDepartment: "Pothole",
    assignedTo: "authority-1",
    image: "/uploads/original-citizen-photo.jpg",
    location: { latitude: 16.233144, longitude: 80.546237, address: "Vadlamudi, Andhra Pradesh, India" },
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

// --- Unit tests: haversineDistanceMeters ------------------------------------

test("haversineDistanceMeters returns 0 for identical coordinates", () => {
  const distance = haversineDistanceMeters(16.233144, 80.546237, 16.233144, 80.546237);
  assert.equal(distance, 0);
});

test("haversineDistanceMeters returns a sane distance for two known nearby-ish points", () => {
  // Vadlamudi (16.233144, 80.546237) vs a point ~35km away
  // (16.5, 80.63333333333334) - roughly matches the two geotagged test
  // fixtures already shipped in test/fixtures/.
  const distance = haversineDistanceMeters(16.233144, 80.546237, 16.5, 80.63333333333334);
  assert.ok(distance > 25000 && distance < 45000, `expected roughly 25-45km, got ${distance}`);
});

test("haversineDistanceMeters returns null for invalid/missing coordinates", () => {
  assert.equal(haversineDistanceMeters(null, 80, 16, 80), null);
  assert.equal(haversineDistanceMeters(16, undefined, 16, 80), null);
  assert.equal(haversineDistanceMeters(NaN, 80, 16, 80), null);
});

// --- Unit tests: verifyResolutionLocation -----------------------------------

test("verifyResolutionLocation marks a resolution photo taken at the exact same coordinates as verified", () => {
  const result = verifyResolutionLocation(
    { latitude: 16.233144, longitude: 80.546237 },
    { latitude: 16.233144, longitude: 80.546237 }
  );

  assert.equal(result.verified, true);
  assert.equal(result.distanceMeters, 0);
  assert.equal(result.message, null);
});

test("verifyResolutionLocation marks a resolution photo far outside the configured radius as unverified, with a warning message, and never substitutes either coordinate pair", () => {
  const original = { latitude: 16.233144, longitude: 80.546237 };
  const resolution = { latitude: 16.5, longitude: 80.63333333333334 }; // ~35km away

  const result = verifyResolutionLocation(original, resolution);

  assert.equal(result.verified, false);
  assert.ok(result.distanceMeters > getAllowedResolutionRadiusMeters());
  assert.equal(result.message, "Resolution photo location is outside the original issue location.");

  // The coordinates themselves must remain completely untouched by the
  // verification check - it is purely informational.
  assert.equal(original.latitude, 16.233144);
  assert.equal(original.longitude, 80.546237);
  assert.equal(resolution.latitude, 16.5);
  assert.equal(resolution.longitude, 80.63333333333334);
});

test("verifyResolutionLocation respects a configurable ALLOWED_RESOLUTION_RADIUS_METERS", () => {
  const original = { latitude: 16.233144, longitude: 80.546237 };
  // ~111m north of the original point (0.001 degrees latitude).
  const resolution = { latitude: 16.234144, longitude: 80.546237 };

  const originalEnv = process.env.ALLOWED_RESOLUTION_RADIUS_METERS;
  try {
    process.env.ALLOWED_RESOLUTION_RADIUS_METERS = "50";
    const tight = verifyResolutionLocation(original, resolution);
    assert.equal(tight.verified, false);
    assert.equal(tight.allowedRadiusMeters, 50);

    process.env.ALLOWED_RESOLUTION_RADIUS_METERS = "500";
    const lenient = verifyResolutionLocation(original, resolution);
    assert.equal(lenient.verified, true);
    assert.equal(lenient.allowedRadiusMeters, 500);
  } finally {
    if (originalEnv === undefined) {
      delete process.env.ALLOWED_RESOLUTION_RADIUS_METERS;
    } else {
      process.env.ALLOWED_RESOLUTION_RADIUS_METERS = originalEnv;
    }
  }
});

test("verifyResolutionLocation returns a null/unknown verdict (never a false failure) when either coordinate pair is unavailable", () => {
  const result = verifyResolutionLocation(
    { latitude: null, longitude: null },
    { latitude: 16.233144, longitude: 80.546237 }
  );

  assert.equal(result.verified, null);
  assert.equal(result.distanceMeters, null);
  assert.equal(result.message, null);
});

// --- Integration: dashboardController.updateIssueStatus wiring -------------
// These mirror the pattern in test/gpsEndToEnd.test.js and
// test/authorityEvidence.test.js: drive the real HTTP-facing controller
// with a multer-style req.file, using the two geotagged fixtures already
// shipped in test/fixtures/ (which are genuinely ~35km apart) as the
// citizen's original coordinates and the authority's resolution-evidence
// coordinates.

const fs = require("fs");
const os = require("os");
const path = require("path");

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

function copyFixtureToTempUpload(fixturePath) {
  const dest = path.join(
    os.tmpdir(),
    `resolution-verify-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(fixturePath)}`
  );
  fs.copyFileSync(fixturePath, dest);
  return dest;
}

// Both fixtures carry real embedded EXIF GPS (see the exifr probe used
// while building this test): vadlamudi-geotagged.jpg -> (16.233144,
// 80.546237); geotagged-pothole.jpg -> (16.5, 80.63333333333334), roughly
// 35km apart.
const CITIZEN_IMAGE = path.resolve(__dirname, "fixtures/vadlamudi-geotagged.jpg");
const NEARBY_RESOLUTION_IMAGE = path.resolve(__dirname, "fixtures/vadlamudi-geotagged.jpg");
const FAR_RESOLUTION_IMAGE = path.resolve(__dirname, "fixtures/geotagged-pothole.jpg");

test("updateIssueStatus controller marks resolution evidence 'verified' when its EXIF GPS matches the original issue location", async () => {
  const dashboardController = require("../controllers/dashboardController");
  const originalFindById = Issue.findById;
  const mockIssue = makeMockIssue();
  const tempImage = copyFixtureToTempUpload(NEARBY_RESOLUTION_IMAGE);

  try {
    Issue.findById = (id) => {
      // updateIssueStatus (controller) calls `.select("location")`;
      // updateIssueStatus (service) calls Issue.findById(id) directly and
      // awaits it. Support both call styles on the same mock, mirroring
      // how a real mongoose Query object is both awaitable and chainable.
      const query = Promise.resolve(mockIssue);
      query.select = async () => mockIssue;
      return query;
    };

    const req = {
      params: { id: mockIssue._id },
      file: { path: tempImage, filename: path.basename(tempImage) },
      body: { status: undefined, remarks: "Fixed the pothole" },
      user: { role: "authority", _id: "authority-1", department: "Pothole" },
    };
    const res = makeRes();

    await dashboardController.updateIssueStatus(req, res);

    assert.equal(res.statusCode, null, `expected no error status, got ${JSON.stringify(res.body)}`);
    const location = res.body.issue.completionProofLocation;
    assert.equal(location.latitude, 16.233144);
    assert.equal(location.longitude, 80.546237);
    assert.equal(location.verified, true);
    assert.equal(location.distanceMeters, 0);
    assert.equal(location.verificationMessage, null);
  } finally {
    Issue.findById = originalFindById;
    fs.rmSync(tempImage, { force: true });
  }
});

test("updateIssueStatus controller flags resolution evidence as unverified, with a warning, when its EXIF GPS is far from the original issue location - without altering either coordinate pair", async () => {
  const dashboardController = require("../controllers/dashboardController");
  const originalFindById = Issue.findById;
  const mockIssue = makeMockIssue();
  const tempImage = copyFixtureToTempUpload(FAR_RESOLUTION_IMAGE);

  try {
    Issue.findById = (id) => {
      const query = Promise.resolve(mockIssue);
      query.select = async () => mockIssue;
      return query;
    };

    const req = {
      params: { id: mockIssue._id },
      file: { path: tempImage, filename: path.basename(tempImage) },
      body: { status: undefined, remarks: "Fixed a different pothole entirely" },
      user: { role: "authority", _id: "authority-1", department: "Pothole" },
    };
    const res = makeRes();

    await dashboardController.updateIssueStatus(req, res);

    assert.equal(res.statusCode, null, `expected no error status, got ${JSON.stringify(res.body)}`);
    const location = res.body.issue.completionProofLocation;

    // The resolution photo's own authentic EXIF coordinates are stored -
    // never silently swapped for the citizen's.
    assert.equal(location.latitude, 16.5);
    assert.ok(Math.abs(location.longitude - 80.63333333333334) < 0.0001);
    assert.equal(location.verified, false);
    assert.ok(location.distanceMeters > getAllowedResolutionRadiusMeters());
    assert.equal(
      location.verificationMessage,
      "Resolution photo location is outside the original issue location."
    );

    // The original citizen location on the issue is completely untouched.
    assert.equal(mockIssue.location.latitude, 16.233144);
    assert.equal(mockIssue.location.longitude, 80.546237);
  } finally {
    Issue.findById = originalFindById;
    fs.rmSync(tempImage, { force: true });
  }
});

