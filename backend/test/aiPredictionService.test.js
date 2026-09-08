const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { validatePrediction } = require("../services/aiPredictionService");
const { getDepartment, getAuthorityEmail } = require("../services/departmentService");

// --- validatePrediction: the new VALID/UNCERTAIN/REJECTED contract ---------
// ai/scripts/predict.py itself decides confidence/margin rejection and
// reports one of three statuses; validatePrediction's job is to trust that
// classification, never invent/override a category, and always fail closed
// (throw) if the shape it receives can't be trusted.

test("REJECTED predictions are surfaced as Unknown, never as a fabricated category", () => {
  const result = validatePrediction({
    status: "REJECTED",
    confidence: 0.22,
    reason: "Image does not appear to contain a supported civic issue.",
  });

  assert.equal(result.category, "Unknown");
  assert.equal(result.status, "REJECTED");
  assert.equal(result.isRelevant, false);
  assert.equal(result.reason, "Image does not appear to contain a supported civic issue.");
});

test("UNCERTAIN predictions are surfaced as Unknown but marked relevant", () => {
  const result = validatePrediction({
    status: "UNCERTAIN",
    confidence: 0.5,
    reason: "Model confidence is below the required classification threshold.",
  });

  assert.equal(result.category, "Unknown");
  assert.equal(result.status, "UNCERTAIN");
  assert.equal(result.isRelevant, true);
});

test("VALID predictions pass the category and confidence through untouched", () => {
  const result = validatePrediction({ status: "VALID", category: "Drainage", confidence: 0.91 });

  assert.equal(result.category, "Drainage");
  assert.equal(result.status, "VALID");
  assert.equal(result.isRelevant, true);
  assert.equal(getDepartment(result.category), "Drainage");
  assert.equal(getAuthorityEmail(result.category), "drainage.authority@smartcity.com");
});

test("rejects model labels outside the four canonical classes even with status VALID", () => {
  assert.throws(() => validatePrediction({ status: "VALID", category: "Street Light", confidence: 0.99 }));
});

test("rejects a VALID-looking payload with an out-of-range confidence", () => {
  assert.throws(() => validatePrediction({ status: "VALID", category: "Pothole", confidence: 1.4 }));
});

test("legacy payload with no status field is still validated strictly (no silent Pothole fallback)", () => {
  // Simulates an older/misbehaving predict.py that forgot to send `status`.
  // Must never be treated as an automatic VALID pass-through.
  assert.throws(() => validatePrediction({ category: "Pothole", confidence: 0.12 }));
  const ok = validatePrediction({ category: "Garbage", confidence: 0.8 });
  assert.equal(ok.status, "VALID");
  assert.equal(ok.category, "Garbage");
});

// --- Regression: the bounding-box feature is fully gone --------------------

test("no pothole_bbox module remains in the ai/scripts directory", () => {
  const scriptsDir = path.resolve(__dirname, "../../ai/scripts");
  const files = fs.readdirSync(scriptsDir);
  assert.equal(files.includes("pothole_bbox.py"), false);
});

test("aiPredictionService no longer exports sanitizeBoundingBox", () => {
  const aiPredictionService = require("../services/aiPredictionService");
  assert.equal("sanitizeBoundingBox" in aiPredictionService, false);
});
