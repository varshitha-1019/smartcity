const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { generateDescription, normalizeCategory } = require("../services/geocodingService");
const { getDepartment } = require("../services/departmentService");
const { extractGpsMetadata } = require("../services/gpsService");

const realImage = path.resolve(__dirname, "../../ai/test_images/pothole.jpg");
const geoTaggedImage = path.resolve(__dirname, "fixtures/geotagged-pothole.jpg");

test("automatic description uses the detected category and address", () => {
  const description = generateDescription("Pothole", "123 Main Street");
  assert.match(description, /pothole/i);
  assert.match(description, /123 Main Street/i);
});

test("department mapping follows the fixed workflow", () => {
  assert.equal(getDepartment(normalizeCategory("Pothole")), "Pothole");
  assert.equal(getDepartment(normalizeCategory("Garbage")), "Garbage");
  assert.equal(getDepartment(normalizeCategory("Drainage")), "Drainage");
  assert.equal(getDepartment(normalizeCategory("Water Leakage")), "Water Leakage");
});

test("real image path exists for workflow verification", () => {
  assert.ok(require("fs").existsSync(realImage));
});

test("geo-tagged fixture is available for end-to-end workflow verification", async () => {
  const gps = await extractGpsMetadata(geoTaggedImage);
  assert.ok(require("fs").existsSync(geoTaggedImage));
  assert.equal(gps.hasGps, true);
  assert.ok(typeof gps.latitude === "number");
  assert.ok(typeof gps.longitude === "number");
});