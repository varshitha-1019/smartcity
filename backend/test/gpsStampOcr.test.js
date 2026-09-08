const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

// Regression test pinned to the *exact* literal scenario from this bug
// report:
//
//   Uploaded GPS-Map-Camera image, visible stamp (NOT EXIF): "Vadlamudi,
//   Andhra Pradesh, India" / "Lat 16.233144\u00b0 Long 80.546237\u00b0"
//   Conflicting browser/device GPS: 16.408981, 80.621132 (reported as
//                                    being displayed instead - Klef Road,
//                                    Tadepalle, Vaddeswaram, Mangalagiri)
//
// This is deliberately a *different* fixture/code path than
// reportedGpsMismatch.test.js (which covers the EXIF-GPS version of this
// same bug class): this image has no EXIF GPS at all, only a burned-in
// visible stamp, so it only passes if OCR stamp extraction
// (gpsService.extractGpsFromImageStamp) is wired into the priority chain.

let tesseractAvailable = true;
try {
  require.resolve("tesseract.js");
} catch {
  tesseractAvailable = false;
}

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

const { createIssue, previewImageLocation } = require("../controllers/issueController");
const { resolveGpsLocation, extractGpsFromImageStamp, extractGpsMetadata, stopTesseractWorker } = require("../services/gpsService");

test.after(async () => {
  await stopTesseractWorker();
});

const STAMPED_IMAGE = path.resolve(__dirname, "fixtures/vadlamudi-ocr-stamp.jpg");
const NO_GPS_IMAGE = path.resolve(__dirname, "../../ai/test_images/pothole.jpg");

const STAMP_LATITUDE = 16.233144;
const STAMP_LONGITUDE = 80.546237;

// The exact conflicting browser/device coordinates from this bug report.
const REPORTED_DEVICE_LATITUDE = 16.408981;
const REPORTED_DEVICE_LONGITUDE = 80.621132;

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
    `gps-stamp-ocr-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(fixturePath)}`
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

test("[gps stamp] the fixture genuinely has no EXIF GPS (this is an OCR-only stamp)", async () => {
  const result = await extractGpsMetadata(STAMPED_IMAGE);
  assert.equal(result.hasGps, false);
});

test(
  "[gps stamp] extractGpsFromImageStamp reads the burned-in Lat/Long stamp and address",
  { skip: !tesseractAvailable && "tesseract binary is not installed in this environment" },
  async () => {
    const result = await extractGpsFromImageStamp(STAMPED_IMAGE);

    assert.equal(result.hasGps, true);
    assert.equal(result.latitude, STAMP_LATITUDE);
    assert.equal(result.longitude, STAMP_LONGITUDE);
    assert.equal(result.source, "ocr-stamp");
    assert.match(result.address, /Vadlamudi/i);
  }
);

test(
  "[gps stamp] resolveGpsLocation resolves to the OCR stamp, never the conflicting device GPS",
  { skip: !tesseractAvailable && "tesseract binary is not installed in this environment" },
  async () => {
    const result = await resolveGpsLocation(
      { latitude: String(REPORTED_DEVICE_LATITUDE), longitude: String(REPORTED_DEVICE_LONGITUDE) },
      STAMPED_IMAGE
    );

    assert.equal(result.source, "ocr-stamp");
    assert.equal(result.latitude, STAMP_LATITUDE);
    assert.equal(result.longitude, STAMP_LONGITUDE);
    assert.notEqual(result.latitude, REPORTED_DEVICE_LATITUDE);
    assert.notEqual(result.longitude, REPORTED_DEVICE_LONGITUDE);
  }
);

test(
  "[gps stamp] previewImageLocation prefers the stamped address over reverse geocoding",
  { skip: !tesseractAvailable && "tesseract binary is not installed in this environment" },
  async () => {
    const tempImage = copyFixtureToTempUpload(STAMPED_IMAGE);

    try {
      const req = {
        file: { path: tempImage, filename: path.basename(tempImage) },
        body: { latitude: String(REPORTED_DEVICE_LATITUDE), longitude: String(REPORTED_DEVICE_LONGITUDE) },
      };
      const res = makeRes();

      await previewImageLocation(req, res);

      assert.equal(res.body.hasGps, true);
      assert.equal(res.body.source, "ocr-stamp");
      assert.equal(res.body.latitude, STAMP_LATITUDE);
      assert.equal(res.body.longitude, STAMP_LONGITUDE);
      assert.match(res.body.address, /Vadlamudi/i);
    } finally {
      fs.rmSync(tempImage, { force: true });
    }
  }
);

test(
  "[gps stamp] createIssue: the conflicting device GPS never appears anywhere in the stored/returned issue",
  { skip: !tesseractAvailable && "tesseract binary is not installed in this environment" },
  async () => {
    const tempImage = copyFixtureToTempUpload(STAMPED_IMAGE);

    try {
      await withMockedCreate(async (calls) => {
        const req = {
          file: { path: tempImage, filename: path.basename(tempImage) },
          body: {
            priority: "Medium",
            latitude: String(REPORTED_DEVICE_LATITUDE),
            longitude: String(REPORTED_DEVICE_LONGITUDE),
          },
          user: { _id: "mock-citizen-id" },
        };
        const res = makeRes();

        await createIssue(req, res);

        assert.equal(res.statusCode, 201, `expected 201, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
        assert.equal(calls.length, 1);

        const storedLocation = calls[0].location;

        assert.equal(storedLocation.latitude, STAMP_LATITUDE);
        assert.equal(storedLocation.longitude, STAMP_LONGITUDE);
        assert.notEqual(storedLocation.latitude, REPORTED_DEVICE_LATITUDE);
        assert.notEqual(storedLocation.longitude, REPORTED_DEVICE_LONGITUDE);
        assert.match(storedLocation.address, /Vadlamudi/i);

        // Must never mention the wrong nearby locality this bug previously
        // produced (Klef Road / Tadepalle / Vaddeswaram / Mangalagiri).
        assert.doesNotMatch(storedLocation.address, /Klef|Tadepalle|Vaddeswaram|Mangalagiri/i);

        assert.equal(res.body.issue.location.latitude, STAMP_LATITUDE);
        assert.equal(res.body.issue.location.longitude, STAMP_LONGITUDE);
      });
    } finally {
      fs.rmSync(tempImage, { force: true });
    }
  }
);

test("[gps stamp] a genuinely unstamped, non-geotagged image still falls back to browser GPS unaffected", async () => {
  const result = await resolveGpsLocation(
    { latitude: String(REPORTED_DEVICE_LATITUDE), longitude: String(REPORTED_DEVICE_LONGITUDE) },
    NO_GPS_IMAGE
  );

  assert.equal(result.source, "browser");
  assert.equal(result.latitude, REPORTED_DEVICE_LATITUDE);
  assert.equal(result.longitude, REPORTED_DEVICE_LONGITUDE);
});

test("[gps stamp] never selects date, time, weather, or sensor lines as address", async () => {
  const uploadedImage = path.resolve(__dirname, "../uploads/1788718266453-922155923.png");
  if (fs.existsSync(uploadedImage)) {
    const result = await extractGpsFromImageStamp(uploadedImage);
    assert.equal(result.hasGps, true);
    assert.match(result.address, /Vadlamudi/i);
    assert.doesNotMatch(result.address, /Wednesday|GMT|00gC|\d{2}:\d{2}/i);
  }
});
