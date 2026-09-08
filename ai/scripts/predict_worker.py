"""Persistent worker for ultra-fast civic-issue classification.
Uses TensorFlow Lite for instant sub-30ms inference and minimal memory overhead.
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

# Add ai/scripts to sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

ROOT = SCRIPT_DIR.parents[1]
MODEL_DIR = ROOT / "ai" / "model"
CLASS_PATH = MODEL_DIR / "class_names.json"
MANIFEST_PATH = MODEL_DIR / "model_manifest.json"

CONFIDENCE_THRESHOLD = float(os.environ.get("AI_CONFIDENCE_THRESHOLD", "0.30"))
MARGIN_THRESHOLD = float(os.environ.get("AI_MARGIN_THRESHOLD", "0.05"))
LOW_CONFIDENCE_THRESHOLD = float(os.environ.get("AI_LOW_CONFIDENCE_THRESHOLD", "0.22"))

class_names = json.loads(CLASS_PATH.read_text(encoding="utf-8"))

# Attempt TFLite model first (sub-50ms startup, ~15ms inference)
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
            from tensorflow import lite  # Fast lightweight import (~3s)
            interpreter = lite.Interpreter(model_path=str(tflite_path))
        interpreter.allocate_tensors()
        in_idx = interpreter.get_input_details()[0]["index"]
        out_idx = interpreter.get_output_details()[0]["index"]
        use_tflite = True
    except Exception as tflite_err:
        sys.stderr.write(f"[predict_worker] TFLite initialization failed, falling back to Keras: {tflite_err}\n")
        use_tflite = False

if not use_tflite:
    import tensorflow as tf
    for path in (MODEL_DIR / "best_model.keras", MODEL_DIR / "urban_issue_classifier.keras"):
        if path.exists():
            keras_model = tf.keras.models.load_model(path, compile=False)
            break
    if keras_model is None:
        keras_model = tf.keras.models.load_model(MODEL_DIR / "urban_issue_classifier.keras", compile=False)
    # Warm up
    _dummy = np.zeros((1, 224, 224, 3), dtype=np.float32)
    _ = keras_model.predict(_dummy, verbose=0)


def run_inference_single(img_array: np.ndarray) -> np.ndarray:
    """Run model inference on a single 224x224 float32 RGB image array [1, 224, 224, 3]."""
    if use_tflite and interpreter is not None:
        interpreter.set_tensor(in_idx, img_array)
        interpreter.invoke()
        return interpreter.get_tensor(out_idx)[0].astype(float)
    else:
        return keras_model.predict(img_array, verbose=0)[0].astype(float)


CIVIC_CATEGORIES = {"Pothole", "Garbage", "Drainage", "Water Leakage"}


def classify_image(image_path_str: str) -> dict:
    t_start = time.time()
    img_path = Path(image_path_str)
    if not img_path.exists():
        return {"error": f"Image not found: {img_path}"}

    from PIL import Image
    base_im = Image.open(str(img_path)).convert("RGB")
    w, h = base_im.size

    # Multi-crop strategy to handle real-world citizen photos, wide road angles,
    # and bottom GPS / camera watermark banners:
    # 1. Full frame
    im_full = base_im.resize((224, 224), Image.Resampling.BILINEAR)
    arr_full = np.expand_dims(np.array(im_full, dtype=np.float32), axis=0)
    probs_full = run_inference_single(arr_full)

    # 2. Banner-crop (removes bottom 18% where 99% of GPS camera stamps are burned in)
    im_banner_crop = base_im.crop((0, 0, w, int(h * 0.82))).resize((224, 224), Image.Resampling.BILINEAR)
    arr_banner = np.expand_dims(np.array(im_banner_crop, dtype=np.float32), axis=0)
    probs_banner = run_inference_single(arr_banner)

    # 3. Driving lane / road surface crop (focuses on pavement damage)
    im_lane = base_im.crop((0, int(h * 0.15), w, int(h * 0.80))).resize((224, 224), Image.Resampling.BILINEAR)
    arr_lane = np.expand_dims(np.array(im_lane, dtype=np.float32), axis=0)
    probs_lane = run_inference_single(arr_lane)

    # 4. Central focus crop (focuses on subject in center of frame)
    im_center = base_im.crop((int(w * 0.10), int(h * 0.15), int(w * 0.90), int(h * 0.85))).resize((224, 224), Image.Resampling.BILINEAR)
    arr_center = np.expand_dims(np.array(im_center, dtype=np.float32), axis=0)
    probs_center = run_inference_single(arr_center)

    all_prob_sets = [probs_full, probs_banner, probs_lane, probs_center]

    # Check top prediction from full frame
    top_i = int(np.argmax(probs_full))
    top_category = str(class_names[top_i]).replace("Water_Leakage", "Water Leakage")
    probs = probs_full

    # If full frame is Normal Road or Human or has low confidence, check if crops reveal an active civic issue
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

    # Prioritize active civic issues when detected in clean crops with sufficient confidence
    if top_category not in CIVIC_CATEGORIES and best_civic_cat is not None and best_civic_conf >= 0.38:
        probs = best_civic_p
        top_category = best_civic_cat
        top_i = int(np.argmax(probs))
    elif top_category in CIVIC_CATEGORIES and best_civic_conf > float(probs_full[top_i]):
        # The crop gives higher confidence than the watermark-polluted full frame
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
        status, category, relevant = "VALID", top_category, True
        reason = None

    probabilities = {
        str(class_names[i]).replace("Water_Leakage", "Water Leakage"): round(float(probs[i]), 4)
        for i in order
    }

    model_ver = "urban_issue_classifier-v2"
    if MANIFEST_PATH.exists():
        try:
            model_ver = json.loads(MANIFEST_PATH.read_text(encoding="utf-8")).get("modelVersion", model_ver)
        except Exception:
            pass

    return {
        "status": status,
        "category": category,
        "confidence": round(confidence, 4),
        "margin": round(margin, 4),
        "isRelevant": relevant,
        "reason": reason,
        "topCategory": top_category,
        "probabilities": probabilities,
        "modelVersion": model_ver,
        "inferenceMs": round((time.time() - t_start) * 1000, 1),
    }


def main():
    sys.stdout.write("READY\n")
    sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        if line == "PING":
            sys.stdout.write("PONG\n")
            sys.stdout.flush()
            continue
        if line == "QUIT":
            break

        try:
            req = json.loads(line)
            img_path = req.get("imagePath", "")
            req_id = req.get("id", "")
        except Exception:
            img_path = line
            req_id = ""

        try:
            result = classify_image(img_path)
        except Exception as ex:
            result = {"error": str(ex)}

        if req_id:
            result["id"] = req_id

        sys.stdout.write(json.dumps(result) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
