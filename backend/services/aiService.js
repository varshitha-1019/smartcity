// Public entry point for AI civic-issue classification.
//
// The actual model inference (spawning the Python/TensorFlow process against
// ai/model/urban_issue_classifier.keras) lives in aiPredictionService.js.
// This file exists as the stable, service-layer name the rest of the app
// imports from, so controllers depend on "the AI service" rather than an
// implementation-specific module name - it intentionally does not duplicate
// or reimplement the prediction logic itself.
const { predictImage } = require("./aiPredictionService");

module.exports = {
  predictImage,
};
