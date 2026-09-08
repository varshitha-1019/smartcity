const path = require("path");
const os = require("os");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  generateTitle,
  normalizeCategory,
  reverseGeocode,
  buildCoordinateFallbackAddress,
  clearAddressCache,
} = require("../services/geocodingService");

test.beforeEach(() => {
  clearAddressCache();
});
const {
  extractGpsMetadata,
  isValidGpsCoordinates,
  resolveGpsLocation,
  stopTesseractWorker,
} = require("../services/gpsService");

test.after(async () => {
  await stopTesseractWorker();
});
const { validateStoredImage } = require("../services/imageValidationService");
const { validatePrediction } = require("../services/aiPredictionService");
const { getDepartment } = require("../services/departmentService");

test("generateTitle returns the expected title for supported categories", () => {
  assert.equal(generateTitle("Pothole"), "Detected Pothole");
  assert.equal(generateTitle("Garbage"), "Detected Garbage");
  assert.equal(generateTitle("Drainage"), "Detected Drainage");
  assert.equal(generateTitle("Water Leakage"), "Detected Water Leakage");
});

test("generateTitle rejects unsupported categories", () => {
  assert.throws(() => generateTitle("Unknown category"), /Unsupported AI category/);
});

test("normalizeCategory maps AI output to the storage-friendly category", () => {
  assert.equal(normalizeCategory("Water_Leakage"), "Water Leakage");
  assert.equal(normalizeCategory("Pothole"), "Pothole");
  assert.equal(normalizeCategory("Drainage"), "Drainage");
});

test("normalizeCategory rejects unsupported AI categories", () => {
  assert.throws(() => normalizeCategory("Traffic"), /Unsupported AI category/);
});

test("extractGpsMetadata reports missing GPS metadata for the sample image", async () => {
  const imagePath = path.resolve(__dirname, "../../ai/test_images/pothole.jpg");
  const result = await extractGpsMetadata(imagePath);

  assert.equal(result.hasGps, false);
  assert.match(result.message, /GPS metadata/);
});

test("GPS range validation rejects unusable coordinates", () => {
  assert.equal(isValidGpsCoordinates(12.9716, 77.5946), true);
  assert.equal(isValidGpsCoordinates(91, 77.5946), false);
  assert.equal(isValidGpsCoordinates(12.9716, -181), false);
});

// Real, reported bug: a geo-tagged image of Vadlamudi, Andhra Pradesh
// (16.233144, 80.546237) was being reported with an unrelated location
// (16.409002, 80.620844 - Tadapalle/Mangalagiri) because resolveGpsLocation
// checked browser-supplied coordinates *before* the image's own EXIF GPS,
// so a browser location sent alongside the upload silently overrode the
// real, embedded location of the photographed issue. These tests pin the
// exact coordinates from the actual reported image through every stage of
// the pipeline.
test("extractGpsMetadata reads the exact GPS coordinates embedded in a real geo-tagged image", async () => {
  const imagePath = path.resolve(__dirname, "fixtures/vadlamudi-geotagged.jpg");
  const result = await extractGpsMetadata(imagePath);

  assert.equal(result.hasGps, true);
  assert.equal(result.latitude, 16.233144);
  assert.equal(result.longitude, 80.546237);
  assert.equal(result.source, "exif");
});

test("resolveGpsLocation prefers the image's EXIF GPS over browser-supplied coordinates", async () => {
  const imagePath = path.resolve(__dirname, "fixtures/vadlamudi-geotagged.jpg");

  // Simulates the real reported scenario: the frontend sends the device's
  // current browser location alongside an uploaded photo that was actually
  // taken somewhere else entirely.
  const browserBody = { latitude: "16.409002", longitude: "80.620844" };

  const result = await resolveGpsLocation(browserBody, imagePath);

  assert.equal(result.source, "exif");
  assert.equal(result.latitude, 16.233144);
  assert.equal(result.longitude, 80.546237);
  // Explicitly not the browser-supplied (wrong) coordinates.
  assert.notEqual(result.latitude, 16.409002);
  assert.notEqual(result.longitude, 80.620844);
});

test("resolveGpsLocation falls back to browser GPS only when the image has no usable EXIF GPS", async () => {
  // The stock sample image has no GPS metadata at all (covered by the
  // "reports missing GPS metadata" test above), so this exercises the
  // in-app camera capture path, where there's no real EXIF to prefer.
  const imagePath = path.resolve(__dirname, "../../ai/test_images/pothole.jpg");
  const browserBody = { latitude: "16.409002", longitude: "80.620844" };

  const result = await resolveGpsLocation(browserBody, imagePath);

  assert.equal(result.source, "browser");
  assert.equal(result.latitude, 16.409002);
  assert.equal(result.longitude, 80.620844);
});

test("full pipeline: EXIF GPS from a real geo-tagged image survives resolution, reverse geocoding, and the offline fallback unchanged", async () => {
  const imagePath = path.resolve(__dirname, "fixtures/vadlamudi-geotagged.jpg");
  const browserBody = { latitude: "16.409002", longitude: "80.620844" };

  const gpsData = await resolveGpsLocation(browserBody, imagePath);
  assert.equal(gpsData.latitude, 16.233144);
  assert.equal(gpsData.longitude, 80.546237);

  // Case 1: the geocoding provider is reachable - the exact resolved
  // coordinates (not the browser ones) must be what's sent to it.
  const originalFetch = global.fetch;
  try {
    let requestedUrl = null;
    global.fetch = async (url) => {
      requestedUrl = url;
      return { ok: true, json: async () => ({ display_name: "Vadlamudi, Andhra Pradesh, India" }) };
    };

    const address = await reverseGeocode(gpsData.latitude, gpsData.longitude);

    assert.ok(requestedUrl.includes("lat=16.233144"));
    assert.ok(requestedUrl.includes("lon=80.546237"));
    assert.equal(address, "Vadlamudi, Andhra Pradesh, India");
  } finally {
    global.fetch = originalFetch;
  }

  // Case 2: the geocoding provider is unavailable - the offline fallback
  // must still reflect the real EXIF coordinates, never a stale/unrelated
  // place name (e.g. the previously-reported Klef Road/Mangalagiri result).
  clearAddressCache();
  const originalFetch2 = global.fetch;
  try {
    global.fetch = async () => {
      throw new Error("network unavailable");
    };

    let address = await reverseGeocode(gpsData.latitude, gpsData.longitude);
    if (!address) {
      address = buildCoordinateFallbackAddress(gpsData.latitude, gpsData.longitude);
    }

    assert.match(address, /16\.233144/);
    assert.match(address, /80\.546237/);
    assert.doesNotMatch(address, /Klef|Vaddeswaram|Mangalagiri|Tadapalle/i);
  } finally {
    global.fetch = originalFetch2;
  }
});

test("stored image validation rejects a non-image payload", async () => {
  const filePath = path.join(os.tmpdir(), `invalid-upload-${process.pid}.txt`);
  await require("fs/promises").writeFile(filePath, "not an image");
  try {
    await assert.rejects(validateStoredImage(filePath), /not a valid image/);
  } finally {
    await require("fs/promises").unlink(filePath);
  }
});

test("reverseGeocode returns the provider address and handles an unavailable provider", async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({ ok: true, json: async () => ({ display_name: "Vijayawada, India" }) });
    assert.equal(await reverseGeocode(16.5, 80.633333), "Vijayawada, India");
    clearAddressCache();
    global.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
    assert.equal(await reverseGeocode(16.5, 80.633333), null);
  } finally {
    global.fetch = originalFetch;
  }
});

test("reverseGeocode preserves latitude/longitude argument order in the request URL", async () => {
  const originalFetch = global.fetch;
  let requestedUrl = null;
  try {
    global.fetch = async (url) => {
      requestedUrl = url;
      return { ok: true, json: async () => ({ display_name: "Vadlamudi, Andhra Pradesh, India" }) };
    };

    // Real GPS coordinates reported from a geo-tagged image of Vadlamudi,
    // Andhra Pradesh - regression guard against swapping lat/lon when
    // building the provider request.
    await reverseGeocode(16.233144, 80.546237);

    assert.ok(requestedUrl.includes("lat=16.233144"));
    assert.ok(requestedUrl.includes("lon=80.546237"));
  } finally {
    global.fetch = originalFetch;
  }
});

test("buildCoordinateFallbackAddress builds a deterministic address from the real coordinates", () => {
  const address = buildCoordinateFallbackAddress(16.233144, 80.546237);

  assert.match(address, /16\.233144/);
  assert.match(address, /80\.546237/);
  assert.doesNotMatch(address, /Klef|Vaddeswaram|Mangalagiri/i);
});

test("buildCoordinateFallbackAddress returns null when coordinates are missing", () => {
  assert.equal(buildCoordinateFallbackAddress(null, null), null);
  assert.equal(buildCoordinateFallbackAddress(undefined, undefined), null);
});

test("prediction contract rejects low-confidence results without requiring TensorFlow", () => {
  assert.throws(
    () => validatePrediction({ category: "Pothole", confidence: 0.44 }),
    /Invalid image category\. Please upload an image related to Garbage, Drainage, Water Leakage, or Potholes\./
  );
});

test("getDepartment returns the required authority mapping", () => {
  assert.equal(getDepartment("Pothole"), "Pothole");
  assert.equal(getDepartment("Garbage"), "Garbage");
  assert.equal(getDepartment("Drainage"), "Drainage");
  assert.equal(getDepartment("Water Leakage"), "Water Leakage");
});
