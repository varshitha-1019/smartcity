"""Evaluate ai/model/urban_issue_classifier.keras against a real, unseen
held-out test set and print honest metrics.

This script has NOT been run against a real dataset as part of this change
set, because no dataset (`ai/dataset_final/` and a negative/OOD set) exists
in this repository - see ai/README_DATASET.md. It is provided so that, once
that dataset exists, real metrics can be produced instead of fabricated
ones. Running it now, without a dataset, will simply print the "dataset
missing" error below and exit non-zero - it will not print fake numbers.

Expected layout
----------------
    <TEST_DIR>/Drainage/*.jpg
    <TEST_DIR>/Garbage/*.jpg
    <TEST_DIR>/Pothole/*.jpg
    <TEST_DIR>/Water Leakage/*.jpg
    <TEST_DIR>/Unknown/*.jpg      (optional but strongly recommended - the
                                    hand/person/animal/indoor/random-object/
                                    normal-road negative examples described
                                    in ai/README_DATASET.md)

Usage
-----
    AI_TEST_DIR=ai/dataset_final_test python ai/scripts/evaluate.py

Prints, for the test set actually found on disk:
  * per-class precision/recall/F1
  * macro F1
  * overall accuracy
  * confusion matrix
  * for the Unknown/negative class specifically: how many were correctly
    rejected vs incorrectly accepted as a civic-issue category (false
    acceptance rate) - the single most important number for the
    hand-image bug this project set out to fix.

This script reuses the exact same preprocessing (ai/scripts/preprocess.py)
and confidence/margin rejection thresholds (ai/scripts/predict.py) that
production inference uses, so the reported numbers reflect what the app
actually does, not an idealized/raw-argmax evaluation.
"""

import json
import os
import sys
from collections import defaultdict
from pathlib import Path

# pyrefly: ignore [missing-import]
import numpy as np

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODEL_PATH = os.path.join(ROOT_DIR, "ai", "model", "urban_issue_classifier.keras")
CLASS_PATH = os.path.join(ROOT_DIR, "ai", "model", "class_names.json")
TEST_DIR = Path(os.environ.get("AI_TEST_DIR", os.path.join(ROOT_DIR, "ai", "dataset_final_test")))

SUPPORTED_CLASSES = ["Drainage", "Garbage", "Pothole", "Water Leakage"]
NEGATIVE_CLASS = "Unknown"
ALL_LABELS = SUPPORTED_CLASSES + [NEGATIVE_CLASS]
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def discover_test_images():
    """Returns {true_label: [image_path, ...]} for whatever class folders
    actually exist under TEST_DIR. Never invents images or counts."""
    found = {}
    for label in ALL_LABELS:
        folder = TEST_DIR / label
        if not folder.is_dir():
            continue
        images = [p for p in folder.iterdir() if p.suffix.lower() in IMAGE_EXTENSIONS]
        if images:
            found[label] = images
    return found


def main():
    if not TEST_DIR.is_dir():
        print(json.dumps({
            "error": f"Test dataset directory not found: {TEST_DIR}",
            "explanation": (
                "No evaluation was run and no metrics were produced. "
                "See ai/README_DATASET.md for exactly what dataset is "
                "required before this script can report real numbers."
            ),
        }, indent=2))
        sys.exit(1)

    by_class = discover_test_images()
    if not by_class:
        print(json.dumps({
            "error": f"Test dataset directory {TEST_DIR} exists but contains no recognized class folders/images.",
            "expectedFolders": ALL_LABELS,
        }, indent=2))
        sys.exit(1)

    missing_classes = [c for c in SUPPORTED_CLASSES if c not in by_class]
    if missing_classes:
        print(json.dumps({
            "warning": f"Proceeding with a partial test set - missing folders: {missing_classes}",
        }, indent=2))
    if NEGATIVE_CLASS not in by_class:
        print(json.dumps({
            "warning": (
                "No Unknown/negative test images found - the single most "
                "important metric for this project (false acceptance rate "
                "on irrelevant images, e.g. hands) cannot be computed. "
                "See ai/README_DATASET.md."
            ),
        }, indent=2))

    # Imported here (not at module scope) so the "dataset missing" checks
    # above can run and give a clear error even in environments without
    # TensorFlow installed.
    import tensorflow as tf
    from tensorflow.keras.preprocessing import image as keras_image  # type: ignore

    sys.path.insert(0, str(Path(__file__).parent))
    from preprocess import load_for_classification

    with open(CLASS_PATH, "r", encoding="utf-8") as handle:
        class_names = json.load(handle)
    model = tf.keras.models.load_model(MODEL_PATH)

    from predict import AI_CONFIDENCE_THRESHOLD, AI_MARGIN_THRESHOLD, AI_LOW_CONFIDENCE_THRESHOLD  # noqa: E402

    confusion = defaultdict(lambda: defaultdict(int))
    total = 0
    correct = 0
    false_acceptances = 0  # true label Unknown, predicted as a civic category
    negative_total = 0
    negative_rejected = 0

    for true_label, paths in by_class.items():
        for img_path in paths:
            img = load_for_classification(str(img_path))
            arr = keras_image.img_to_array(img)
            arr = np.expand_dims(arr, axis=0)
            arr = tf.keras.applications.mobilenet_v2.preprocess_input(arr)
            probs = model.predict(arr, verbose=0)[0]
            order = np.argsort(probs)[::-1]
            top_idx = int(order[0])
            top_conf = float(probs[top_idx])
            margin = top_conf - float(probs[int(order[1])])
            top_category = class_names[top_idx]
            if top_category == "Water_Leakage":
                top_category = "Water Leakage"

            if top_conf < AI_LOW_CONFIDENCE_THRESHOLD:
                predicted_label = "Unknown"
            elif top_conf < AI_CONFIDENCE_THRESHOLD or margin < AI_MARGIN_THRESHOLD:
                predicted_label = "Unknown"
            else:
                predicted_label = top_category

            confusion[true_label][predicted_label] += 1
            total += 1
            if predicted_label == true_label:
                correct += 1

            if true_label == NEGATIVE_CLASS:
                negative_total += 1
                if predicted_label == NEGATIVE_CLASS:
                    negative_rejected += 1
                else:
                    false_acceptances += 1

    per_class = {}
    for label in ALL_LABELS:
        tp = confusion[label][label]
        fn = sum(confusion[label][other] for other in ALL_LABELS if other != label)
        fp = sum(confusion[other][label] for other in ALL_LABELS if other != label)
        precision = tp / (tp + fp) if (tp + fp) else None
        recall = tp / (tp + fn) if (tp + fn) else None
        f1 = (
            2 * precision * recall / (precision + recall)
            if precision is not None and recall is not None and (precision + recall) > 0
            else None
        )
        support = tp + fn
        if support == 0:
            continue
        per_class[label] = {"precision": precision, "recall": recall, "f1": f1, "support": support}

    f1_values = [m["f1"] for m in per_class.values() if m["f1"] is not None]
    macro_f1 = sum(f1_values) / len(f1_values) if f1_values else None

    report = {
        "testDir": str(TEST_DIR),
        "totalImages": total,
        "accuracy": correct / total if total else None,
        "perClass": per_class,
        "macroF1": macro_f1,
        "confusionMatrix": {k: dict(v) for k, v in confusion.items()},
        "negativeClassEvaluation": {
            "irrelevantImagesTested": negative_total,
            "correctlyRejected": negative_rejected,
            "incorrectlyAcceptedAsCivicIssue": false_acceptances,
            "falseAcceptanceRate": (false_acceptances / negative_total) if negative_total else None,
        },
        "thresholdsUsed": {
            "confidence": AI_CONFIDENCE_THRESHOLD,
            "margin": AI_MARGIN_THRESHOLD,
            "lowConfidence": AI_LOW_CONFIDENCE_THRESHOLD,
        },
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
