const fs = require("fs");
const path = require("path");
const os = require("os");
const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

// Full end-to-end regression coverage for the reported GPS bug: an uploaded
// image with valid EXIF GPS was being reported/displayed at the device's
// *browser* GPS location instead. `test/issueWorkflow.test.js` and
// `services/gpsService.test-style` checks already prove
// `resolveGpsLocation`/`extractGpsMetadata` prefer EXIF in isolation - this
// file instead drives the actual HTTP-facing `createIssue` controller (the
// real code path a citizen's upload goes through: multer-style req.file +
// req.body, GPS resolution, reverse geocoding, and Issue persistence) with
// the exact conflicting coordinates from the bug report, to prove the bug
// cannot reoccur anywhere along that path.

const Issue = require("../models/issueModel");

// `issueController.js` destructures `predictImage` out of `aiService`, and
// `aiService.js` in turn destructures it out of `aiPredictionService` - both
// destructures copy the function reference at require-time rather than
// holding a live binding to the module's export. So to make `createIssue`
// use a mocked prediction (the real model needs a Python/TensorFlow
// environment this sandbox doesn't have), the mock has to be installed on
// `aiPredictionService` *before* `aiService`/`issueController` are first
// required anywhere in this process - patching it afterwards would have no
// effect, since by then both layers already hold their own copied
// reference to the real function.
const aiPredictionService = require("../services/aiPredictionService");
const originalPredictImage = aiPredictionService.predictImage;
aiPredictionService.predictImage = async () => ({
  category: "Pothole",
  confidence: 0.91,
  status: "VALID",
  isRelevant: true,
  reason: null,
  modelVersion: "test-mock",
});

const { createIssue } = require("../controllers/issueController");
const { resolveGpsLocation, stopTesseractWorker } = require("../services/gpsService");

test.after(async () => {
  await stopTesseractWorker();
});

const VADLAMUDI_IMAGE = path.resolve(__dirname, "fixtures/vadlamudi-geotagged.jpg");
const NO_GPS_IMAGE = path.resolve(__dirname, "../../ai/test_images/pothole.jpg");

// Exact values from the bug report.
const EXIF_LATITUDE = 16.233144;
const EXIF_LONGITUDE = 80.546237;
const BROWSER_LATITUDE = 16.408914;
const BROWSER_LONGITUDE = 80.62132;

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
    `gps-e2e-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(fixturePath)}`
  );
  fs.copyFileSync(fixturePath, dest);
  return dest;
}

function withMockedCreate(fn) {
  // `Issue` is required by reference in issueController.js and Issue.create
  // is looked up at call time, so patching the property here (rather than
  // re-requiring the module) is visible to the controller regardless of
  // require order/caching.
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

test("createIssue: EXIF GPS wins over conflicting browser GPS through the full controller path", async () => {
  const tempImage = copyFixtureToTempUpload(VADLAMUDI_IMAGE);

  try {
    await withMockedCreate(async (calls) => {
      const req = {
        file: { path: tempImage, filename: path.basename(tempImage) },
        // These are the exact conflicting device/browser coordinates from
        // the bug report - present in the request alongside an image that
        // has its own valid EXIF GPS.
        body: {
          priority: "Medium",
          latitude: String(BROWSER_LATITUDE),
          longitude: String(BROWSER_LONGITUDE),
        },
        user: { _id: "mock-citizen-id" },
      };
      const res = makeRes();

      await createIssue(req, res);

      assert.equal(res.statusCode, 201, `expected 201, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
      assert.equal(calls.length, 1);

      const storedLocation = calls[0].location;

      // The stored/returned coordinates must be the EXIF ones, never the
      // conflicting browser ones.
      assert.equal(storedLocation.latitude, EXIF_LATITUDE);
      assert.equal(storedLocation.longitude, EXIF_LONGITUDE);
      assert.notEqual(storedLocation.latitude, BROWSER_LATITUDE);
      assert.notEqual(storedLocation.longitude, BROWSER_LONGITUDE);

      // Reverse geocoding must have been run against the resolved (EXIF)
      // coordinates, not the browser ones. We deliberately do NOT assert
      // that the address *text* contains the raw coordinates: when the
      // live reverse-geocoding provider is reachable it correctly returns
      // a genuine human-readable place name (e.g. "Tenali - Narakoduru
      // Road, ..."), and when it isn't reachable the code falls back to a
      // coordinate-embedding address instead - both are correct behavior
      // for the address field. The coordinates themselves are the
      // authoritative signal for this test, and they're only ever
      // reliably observable via the dedicated `location.latitude`/
      // `location.longitude` fields (asserted above and below), never by
      // pattern-matching the address string.
      assert.equal(typeof storedLocation.address, "string");
      assert.ok(storedLocation.address.length > 0);

      // The JSON response returned to the client (what every dashboard/
      // detail page renders) must reflect the same resolved location -
      // both the human-readable address and, independently, the resolved
      // EXIF coordinates.
      assert.equal(res.body.issue.location.latitude, EXIF_LATITUDE);
      assert.equal(res.body.issue.location.longitude, EXIF_LONGITUDE);
      assert.equal(typeof res.body.address, "string");
      assert.ok(res.body.address.length > 0);
    });
  } finally {
    fs.rmSync(tempImage, { force: true });
  }
});

test("createIssue: browser GPS is used only as a fallback when the image has no EXIF GPS", async () => {
  const tempImage = copyFixtureToTempUpload(NO_GPS_IMAGE);

  try {
    await withMockedCreate(async (calls) => {
        const req = {
          file: { path: tempImage, filename: path.basename(tempImage) },
          body: {
            priority: "Medium",
            latitude: String(BROWSER_LATITUDE),
            longitude: String(BROWSER_LONGITUDE),
          },
          user: { _id: "mock-citizen-id" },
        };
        const res = makeRes();

        await createIssue(req, res);

        assert.equal(res.statusCode, 201, `expected 201, got ${res.statusCode}: ${JSON.stringify(res.body)}`);

        const storedLocation = calls[0].location;
        assert.equal(storedLocation.latitude, BROWSER_LATITUDE);
      assert.equal(storedLocation.longitude, BROWSER_LONGITUDE);
    });
  } finally {
    fs.rmSync(tempImage, { force: true });
  }
});

test("createIssue: neither EXIF nor browser GPS available is rejected rather than fabricated", async () => {
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

test("resolveGpsLocation: EXIF overrides conflicting browser GPS in isolation (regression guard)", async () => {
  const result = await resolveGpsLocation(
    { latitude: String(BROWSER_LATITUDE), longitude: String(BROWSER_LONGITUDE) },
    VADLAMUDI_IMAGE
  );

  assert.equal(result.source, "exif");
  assert.equal(result.latitude, EXIF_LATITUDE);
  assert.equal(result.longitude, EXIF_LONGITUDE);
});
