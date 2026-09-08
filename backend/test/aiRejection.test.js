const fs = require("fs");
const path = require("path");
const os = require("os");
const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

// Coverage for the AI rejection pipeline: createIssue must never turn an
// UNCERTAIN/REJECTED prediction into a fabricated civic-issue category, and
// must never create an Issue document for one. Uses the same
// mock-before-first-require pattern as gpsEndToEnd.test.js /
// (the former) boundingBox.test.js, since issueController destructures
// predictImage out of aiService (which destructures it out of
// aiPredictionService) at require time.

const Issue = require("../models/issueModel");
const aiPredictionService = require("../services/aiPredictionService");

let mockPrediction = {
  category: "Pothole",
  confidence: 0.88,
  status: "VALID",
  isRelevant: true,
  reason: null,
  modelVersion: "test-mock",
};
aiPredictionService.predictImage = async () => mockPrediction;

const { createIssue } = require("../controllers/issueController");

const VADLAMUDI_IMAGE = path.resolve(__dirname, "fixtures/vadlamudi-geotagged.jpg");

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
    `ai-rejection-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(fixturePath)}`
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

test("createIssue: a REJECTED prediction never creates an Issue and reports Unknown", async () => {
  mockPrediction = {
    category: "Unknown",
    confidence: 0.22,
    status: "REJECTED",
    isRelevant: false,
    reason: "Image does not appear to contain a supported civic issue.",
    modelVersion: "test-mock",
  };

  const tempImage = copyFixtureToTempUpload(VADLAMUDI_IMAGE);

  try {
    await withMockedCreate(async (calls) => {
      const req = {
        file: { path: tempImage, filename: path.basename(tempImage) },
        body: { priority: "Medium" },
        user: { _id: "mock-citizen-id" },
      };
      const res = makeRes();

      await createIssue(req, res);

      assert.equal(res.statusCode, 422, `expected 422, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
      assert.equal(calls.length, 0, "no Issue should be created for a rejected image");
      assert.equal(res.body.aiStatus, "REJECTED");
      assert.equal(res.body.isRelevant, false);
      assert.equal(res.body.category, "Unknown");
      assert.equal(fs.existsSync(tempImage), false, "the rejected upload should be cleaned up");
    });
  } finally {
    if (fs.existsSync(tempImage)) fs.rmSync(tempImage, { force: true });
  }
});

test("createIssue: an UNCERTAIN prediction never creates an Issue and reports Unknown (still relevant)", async () => {
  mockPrediction = {
    category: "Unknown",
    confidence: 0.5,
    status: "UNCERTAIN",
    isRelevant: true,
    reason: "Model confidence is below the required classification threshold.",
    modelVersion: "test-mock",
  };

  const tempImage = copyFixtureToTempUpload(VADLAMUDI_IMAGE);

  try {
    await withMockedCreate(async (calls) => {
      const req = {
        file: { path: tempImage, filename: path.basename(tempImage) },
        body: { priority: "Medium" },
        user: { _id: "mock-citizen-id" },
      };
      const res = makeRes();

      await createIssue(req, res);

      assert.equal(res.statusCode, 422);
      assert.equal(calls.length, 0, "no Issue should be created for an uncertain image");
      assert.equal(res.body.aiStatus, "UNCERTAIN");
      assert.equal(res.body.isRelevant, true);
    });
  } finally {
    if (fs.existsSync(tempImage)) fs.rmSync(tempImage, { force: true });
  }
});

test("createIssue: a VALID prediction still creates the Issue exactly as before (no regression)", async () => {
  mockPrediction = {
    category: "Drainage",
    confidence: 0.91,
    status: "VALID",
    isRelevant: true,
    reason: null,
    modelVersion: "test-mock",
  };

  const tempImage = copyFixtureToTempUpload(VADLAMUDI_IMAGE);

  try {
    await withMockedCreate(async (calls) => {
      const req = {
        file: { path: tempImage, filename: path.basename(tempImage) },
        body: { priority: "Medium" },
        user: { _id: "mock-citizen-id" },
      };
      const res = makeRes();

      await createIssue(req, res);

      assert.equal(res.statusCode, 201, `expected 201, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].category, "Drainage");
      assert.equal(calls[0].aiPrediction.category, "Drainage");
      assert.equal(calls[0].aiPrediction.boundingBox, undefined, "bounding box field must no longer exist");
    });
  } finally {
    fs.rmSync(tempImage, { force: true });
  }
});
