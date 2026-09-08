"""Predict one civic issue image and reject weak/ambiguous predictions.
Uses TensorFlow Lite for instant execution with Keras fallback.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

import warnings
warnings.filterwarnings("ignore")

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / "ai" / "model"
CLASS_PATH = MODEL_DIR / "class_names.json"
MANIFEST_PATH = MODEL_DIR / "model_manifest.json"

CONFIDENCE_THRESHOLD = float(os.environ.get("AI_CONFIDENCE_THRESHOLD", "0.30"))
MARGIN_THRESHOLD = float(os.environ.get("AI_MARGIN_THRESHOLD", "0.05"))
LOW_CONFIDENCE_THRESHOLD = float(os.environ.get("AI_LOW_CONFIDENCE_THRESHOLD", "0.22"))

CIVIC_CATEGORIES = {"Pothole", "Garbage", "Drainage", "Water Leakage"}


def main() -> int:
    t_start = time.time()
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No image path provided"}))
        return 1
    img_path = Path(sys.argv[1])
    if not img_path.exists():
        print(json.dumps({"error": f"Image not found: {img_path}"}))
        return 1

    try:
        class_names = json.loads(CLASS_PATH.read_text(encoding="utf-8"))
        tflite_path = MODEL_DIR / "best_model.tflite"

        use_tflite = False
        interpreter = None
        in_idx = None
        out_idx = None
        keras_model = None

        if tflite_path.exists():
            try:
                try:
                    import tflite_runtime.interpreter as tflite
                    interpreter = tflite.Interpreter(model_path=str(tflite_path))
                except ImportError:
                    from tensorflow import lite
                    interpreter = lite.Interpreter(model_path=str(tflite_path))
                interpreter.allocate_tensors()
                in_idx = interpreter.get_input_details()[0]["index"]
                out_idx = interpreter.get_output_details()[0]["index"]
                use_tflite = True
                model_used_path = str(tflite_path)
            except Exception:
                use_tflite = False

        if not use_tflite:
            import tensorflow as tf
            for path in (MODEL_DIR / "best_model.keras", MODEL_DIR / "urban_issue_classifier.keras"):
                if path.exists():
                    keras_model = tf.keras.models.load_model(path, compile=False)
                    model_used_path = str(path)
                    break
            if keras_model is None:
                keras_model = tf.keras.models.load_model(MODEL_DIR / "urban_issue_classifier.keras", compile=False)
                model_used_path = str(MODEL_DIR / "urban_issue_classifier.keras")

        def run_inference(img_arr: np.ndarray) -> np.ndarray:
            if use_tflite and interpreter is not None:
                interpreter.set_tensor(in_idx, img_arr)
                interpreter.invoke()
                return interpreter.get_tensor(out_idx)[0].astype(float)
            else:
                return keras_model.predict(img_arr, verbose=0)[0].astype(float)

        from PIL import Image
        base_im = Image.open(str(img_path)).convert("RGB")
        w, h = base_im.size

        # Multi-crop evaluation
        im_full = base_im.resize((224, 224), Image.Resampling.BILINEAR)
        arr_full = np.expand_dims(np.array(im_full, dtype=np.float32), axis=0)
        probs_full = run_inference(arr_full)

        im_banner = base_im.crop((0, 0, w, int(h * 0.82))).resize((224, 224), Image.Resampling.BILINEAR)
        arr_banner = np.expand_dims(np.array(im_banner, dtype=np.float32), axis=0)
        probs_banner = run_inference(arr_banner)

        im_lane = base_im.crop((0, int(h * 0.15), w, int(h * 0.80))).resize((224, 224), Image.Resampling.BILINEAR)
        arr_lane = np.expand_dims(np.array(im_lane, dtype=np.float32), axis=0)
        probs_lane = run_inference(arr_lane)

        im_center = base_im.crop((int(w * 0.10), int(h * 0.15), int(w * 0.90), int(h * 0.85))).resize((224, 224), Image.Resampling.BILINEAR)
        arr_center = np.expand_dims(np.array(im_center, dtype=np.float32), axis=0)
        probs_center = run_inference(arr_center)

        all_prob_sets = [probs_full, probs_banner, probs_lane, probs_center]

        top_i = int(np.argmax(probs_full))
        top_category = str(class_names[top_i]).replace("Water_Leakage", "Water Leakage")
        probs = probs_full

        best_civic_p = None
        best_civic_conf = 0.0
        best_civic_cat = None

        for crop_p in all_prob_sets:
            c_i = int(np.argmax(crop_p))
            c_cat = str(class_names[c_i]).replace("Water_Leakage", "Water Leakage")
            c_conf = float(crop_p[c_i])
            if c_cat in CIVIC_CATEGORIES and c_conf > best_civic_conf:
                best_civic_conf = c_conf
                best_civic_cat = c_cat
                best_civic_p = crop_p

        if top_category not in CIVIC_CATEGORIES and best_civic_cat is not None and best_civic_conf >= 0.38:
            probs = best_civic_p
            top_category = best_civic_cat
            top_i = int(np.argmax(probs))
        elif top_category in CIVIC_CATEGORIES and best_civic_conf > float(probs_full[top_i]):
            probs = best_civic_p
            top_category = best_civic_cat
            top_i = int(np.argmax(probs))

        order = np.argsort(probs)[::-1]
        confidence = float(probs[top_i])
        second_i = int(order[1]) if len(order) > 1 else top_i
        margin = confidence - float(probs[second_i]) if len(order) > 1 else confidence

        if top_category == "Human":
            status, category, relevant = "REJECTED", "Unknown", False
            reason = "Human detected in image. Please upload a photo of a civic issue (e.g. Garbage, Drainage, Pothole, Water Leakage)."
        elif top_category == "Normal Road":
            status, category, relevant = "REJECTED", "Unknown", False
            reason = "Normal road detected with no significant road damage or civic issue."
        elif confidence < LOW_CONFIDENCE_THRESHOLD:
            status, category, relevant = "REJECTED", "Unknown", False
            top_category = "Non-Civic Subject"
            reason = "Not recognized as a supported civic issue."
        elif confidence < CONFIDENCE_THRESHOLD or margin < MARGIN_THRESHOLD:
            status, category, relevant = "UNCERTAIN", "Unknown", True
            reason = "Low confidence or ambiguous image."
        else:
            status, category, relevant, reason = "VALID", top_category, True, None

        model_version = "urban_issue_classifier-v2"
        if MANIFEST_PATH.exists():
            try:
                model_version = json.loads(MANIFEST_PATH.read_text(encoding="utf-8")).get("modelVersion", model_version)
            except Exception:
                pass

        result = {
            "category": category,
            "topCategory": top_category,
            "confidence": round(confidence, 4),
            "margin": round(margin, 4),
            "status": status,
            "isRelevant": relevant,
            "reason": reason,
            "probabilities": {str(class_names[i]).replace("Water_Leakage", "Water Leakage"): round(float(probs[i]), 4) for i in range(len(class_names))},
            "modelVersion": model_version,
            "modelPath": model_used_path,
            "inferenceMs": round((time.time() - t_start) * 1000, 1),
        }
        print(json.dumps(result))
        return 0
    except Exception as exc:
        print(json.dumps({"error": f"Prediction failed: {exc}"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

