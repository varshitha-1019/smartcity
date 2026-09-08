const fs = require("fs");
const path = require("path");
const os = require("os");
const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

// Regression test pinned to the *exact* literal coordinates from this
// specific bug report:
//
//   Uploaded image EXIF GPS  : 16.233144, 80.546237  (Vadlamudi, AP)
//   Conflicting browser GPS  : 16.408997, 80.620862  (reported as being
//                               displayed instead - Klef Road/Tadepalle/
//                               Vaddeswaram/Mangalagiri/Guntur)
//
// `geocodingService.test.js` already covers this exact bug class with
// slightly different browser coordinates (16.409002, 80.620844); this file
// pins the literal numbers from *this* report end-to-end through the real
// `createIssue` HTTP-facing controller (not just `resolveGpsLocation` in
// isolation), so there is zero ambiguity about whether this specific
// reported case is covered.

const Issue = require("../models/issueModel");

const aiPredictionService = require("../services/aiPredictionService");
aiPredictionService.predictImage = async () => ({
  category: "Pothole",
  confidence: 0.9,
  status: "VALID",
  isRelevant: true,
  reason: null,
  modelVersion: "test-mock",
});

const { createIssue } = require("../controllers/issueController");
const { resolveGpsLocation, extractGpsMetadata, stopTesseractWorker } = require("../services/gpsService");

test.after(async () => {
  await stopTesseractWorker();
});

const VADLAMUDI_IMAGE = path.resolve(__dirname, "fixtures/vadlamudi-geotagged.jpg");
const NO_GPS_IMAGE = path.resolve(__dirname, "../../ai/test_images/pothole.jpg");

const EXIF_LATITUDE = 16.233144;
const EXIF_LONGITUDE = 80.546237;

// The exact conflicting browser/device coordinates from this bug report.
const REPORTED_BROWSER_LATITUDE = 16.408997;
const REPORTED_BROWSER_LONGITUDE = 80.620862;

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
    `reported-bug-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(fixturePath)}`
  );
  fs.copyFileSync(fixturePath, dest);
  return dest;
}

function withMockedCreate(fn) {
  const original = Issue.create;
  const calls = [];

  Issue.create = async (payload) => {
    calls.push(payload);
    return { ...payload, _id: "mock-issue-id" };
  };

  return fn(calls).finally(() => {
    Issue.create = original;
  });
}

test("[reported bug] the image's own EXIF GPS extracts to the exact coordinates from the report", async () => {
  const result = await extractGpsMetadata(VADLAMUDI_IMAGE);

  assert.equal(result.hasGps, true);
  assert.equal(result.latitude, EXIF_LATITUDE);
  assert.equal(result.longitude, EXIF_LONGITUDE);
  assert.equal(result.source, "exif");
});

test("[reported bug] resolveGpsLocation resolves to EXIF GPS, never the exact reported conflicting browser GPS", async () => {
  const result = await resolveGpsLocation(
    { latitude: String(REPORTED_BROWSER_LATITUDE), longitude: String(REPORTED_BROWSER_LONGITUDE) },
    VADLAMUDI_IMAGE
  );

  assert.equal(result.source, "exif");
  assert.equal(result.latitude, EXIF_LATITUDE);
  assert.equal(result.longitude, EXIF_LONGITUDE);
  assert.notEqual(result.latitude, REPORTED_BROWSER_LATITUDE);
  assert.notEqual(result.longitude, REPORTED_BROWSER_LONGITUDE);
});

test("[reported bug] createIssue: the exact reported conflicting browser GPS never appears anywhere in the stored/returned issue", async () => {
  const tempImage = copyFixtureToTempUpload(VADLAMUDI_IMAGE);

  try {
    await withMockedCreate(async (calls) => {
      const req = {
        file: { path: tempImage, filename: path.basename(tempImage) },
        body: {
          priority: "Medium",
          latitude: String(REPORTED_BROWSER_LATITUDE),
          longitude: String(REPORTED_BROWSER_LONGITUDE),
        },
        user: { _id: "mock-citizen-id" },
      };
      const res = makeRes();

      await createIssue(req, res);

      assert.equal(res.statusCode, 201, `expected 201, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
      assert.equal(calls.length, 1);

      const storedLocation = calls[0].location;

      assert.equal(storedLocation.latitude, EXIF_LATITUDE);
      assert.equal(storedLocation.longitude, EXIF_LONGITUDE);
      assert.notEqual(storedLocation.latitude, REPORTED_BROWSER_LATITUDE);
      assert.notEqual(storedLocation.longitude, REPORTED_BROWSER_LONGITUDE);

      // The address text itself must never mention the wrong locality this
      // bug previously produced (Klef Road / Tadepalle / Vaddeswaram /
      // Mangalagiri), regardless of whether the live geocoding provider or
      // the offline coordinate-based fallback produced it.
      assert.doesNotMatch(storedLocation.address, /Klef|Tadepalle|Vaddeswaram|Mangalagiri/i);

      // This is what every dashboard (citizen/authority/admin) and the map
      // actually render from - must carry the same resolved coordinates.
      assert.equal(res.body.issue.location.latitude, EXIF_LATITUDE);
      assert.equal(res.body.issue.location.longitude, EXIF_LONGITUDE);
    });
  } finally {
    fs.rmSync(tempImage, { force: true });
  }
});

test("[reported bug] fallback path is unaffected: browser GPS is still used when the image truly has no EXIF GPS", async () => {
  const tempImage = copyFixtureToTempUpload(NO_GPS_IMAGE);

  try {
    await withMockedCreate(async (calls) => {
      const req = {
        file: { path: tempImage, filename: path.basename(tempImage) },
        body: {
          priority: "Medium",
          latitude: String(REPORTED_BROWSER_LATITUDE),
          longitude: String(REPORTED_BROWSER_LONGITUDE),
        },
        user: { _id: "mock-citizen-id" },
      };
      const res = makeRes();

      await createIssue(req, res);

      assert.equal(res.statusCode, 201, `expected 201, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
      assert.equal(calls[0].location.latitude, REPORTED_BROWSER_LATITUDE);
      assert.equal(calls[0].location.longitude, REPORTED_BROWSER_LONGITUDE);
    });
  } finally {
    fs.rmSync(tempImage, { force: true });
  }
});

test("[reported bug] neither EXIF nor browser GPS available is still rejected, not fabricated", async () => {
  const tempImage = copyFixtureToTempUpload(NO_GPS_IMAGE);

  try {
    await withMockedCreate(async (calls) => {
      const req = {
        file: { path: tempImage, filename: path.basename(tempImage) },
        body: { priority: "Medium" },
        user: { _id: "mock-citizen-id" },
      };
      const res = makeRes();

      await createIssue(req, res);

      assert.equal(res.statusCode, 400);
      assert.equal(calls.length, 0);
      assert.match(res.body.message, /GPS|geo-tagged/i);
    });
  } finally {
    fs.rmSync(tempImage, { force: true });
  }
});
