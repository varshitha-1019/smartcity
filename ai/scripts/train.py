"""Train the SmartCity 4-class image classifier with a stable class-index contract."""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

import numpy as np
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers

ROOT = Path(__file__).resolve().parents[2]
DATASET_DIR = Path(os.environ.get("AI_DATASET_DIR", ROOT / "ai" / "dataset_final"))
MODEL_DIR = ROOT / "ai" / "model"
BEST_MODEL = MODEL_DIR / "best_model.keras"
PRODUCTION_MODEL = MODEL_DIR / "urban_issue_classifier.keras"
CLASS_PATH = MODEL_DIR / "class_names.json"
MANIFEST_PATH = MODEL_DIR / "model_manifest.json"
CLASS_NAMES = ["Drainage", "Garbage", "Human", "Normal Road", "Pothole", "Water Leakage"]
IMG_SIZE = (224, 224)
BATCH_SIZE = int(os.environ.get("AI_BATCH_SIZE", "32"))
SEED = 42
HEAD_EPOCHS = int(os.environ.get("AI_HEAD_EPOCHS", "5"))
FINE_TUNE_EPOCHS = int(os.environ.get("AI_FINE_TUNE_EPOCHS", "6"))


def validate_dataset() -> dict[str, int]:
    counts = {}
    for name in CLASS_NAMES:
        folder = DATASET_DIR / name
        if not folder.is_dir():
            raise FileNotFoundError(f"Missing class folder: {folder}")
        count = sum(1 for p in folder.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".bmp"})
        if count < 50:
            raise RuntimeError(f"{name} has only {count} images; need at least 50 usable images.")
        counts[name] = count
    return counts


def make_datasets():
    kwargs = dict(
        directory=DATASET_DIR,
        labels="inferred",
        label_mode="int",
        class_names=CLASS_NAMES,
        validation_split=0.2,
        seed=SEED,
        image_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
    )
    train_ds = keras.utils.image_dataset_from_directory(subset="training", shuffle=True, **kwargs)
    val_ds = keras.utils.image_dataset_from_directory(subset="validation", shuffle=False, **kwargs)
    return train_ds.prefetch(tf.data.AUTOTUNE), val_ds.prefetch(tf.data.AUTOTUNE)


def build_model():
    augmentation = keras.Sequential([
        layers.RandomFlip("horizontal"),
        layers.RandomRotation(0.04),
        layers.RandomZoom((-0.15, 0.15), (-0.15, 0.15)),
        layers.RandomContrast(0.15),
    ], name="augmentation")

    base = keras.applications.MobileNetV2(input_shape=IMG_SIZE + (3,), include_top=False, weights="imagenet")
    base.trainable = False

    inputs = keras.Input(shape=IMG_SIZE + (3,))
    x = augmentation(inputs)
    x = keras.applications.mobilenet_v2.preprocess_input(x)
    x = base(x, training=False)
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.Dropout(0.30)(x)
    outputs = layers.Dense(len(CLASS_NAMES), activation="softmax", name="issue_category")(x)
    model = keras.Model(inputs, outputs)
    return model, base


def compute_class_weight(counts: dict[str, int]) -> dict[int, float]:
    total = float(sum(counts.values()))
    n = len(CLASS_NAMES)
    return {i: total / (n * counts[name]) for i, name in enumerate(CLASS_NAMES)}


def main():
    np.random.seed(SEED)
    tf.random.set_seed(SEED)
    counts = validate_dataset()
    train_ds, val_ds = make_datasets()
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    CLASS_PATH.write_text(json.dumps(CLASS_NAMES, indent=2), encoding="utf-8")

    model, base = build_model()
    class_weight = compute_class_weight(counts)
    callbacks = [
        keras.callbacks.ModelCheckpoint(str(BEST_MODEL), monitor="val_accuracy", mode="max", save_best_only=True, verbose=1),
        keras.callbacks.EarlyStopping(monitor="val_loss", patience=4, restore_best_weights=True, verbose=1),
        keras.callbacks.ReduceLROnPlateau(monitor="val_loss", patience=2, factor=0.3, min_lr=1e-7, verbose=1),
    ]

    model.compile(optimizer=keras.optimizers.Adam(2e-4), loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    model.fit(train_ds, validation_data=val_ds, epochs=HEAD_EPOCHS, class_weight=class_weight, callbacks=callbacks)

    # Fine-tune only upper feature layers; keep BatchNorm frozen for stability.
    base.trainable = True
    for layer in base.layers[:-45]:
        layer.trainable = False
    for layer in base.layers:
        if isinstance(layer, layers.BatchNormalization):
            layer.trainable = False

    model.compile(optimizer=keras.optimizers.Adam(1e-5), loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    model.fit(train_ds, validation_data=val_ds, epochs=HEAD_EPOCHS + FINE_TUNE_EPOCHS, initial_epoch=HEAD_EPOCHS,
              class_weight=class_weight, callbacks=callbacks)

    # Critical stale-model fix: deploy the SAME checkpoint that won validation.
    if not BEST_MODEL.exists():
        raise RuntimeError("Training finished without best_model.keras")
    shutil.copy2(BEST_MODEL, PRODUCTION_MODEL)
    best = keras.models.load_model(BEST_MODEL)
    val_loss, val_acc = best.evaluate(val_ds, verbose=0)
    manifest = {
        "modelVersion": "urban_issue_classifier-v2",
        "classes": CLASS_NAMES,
        "datasetCounts": counts,
        "validationAccuracy": float(val_acc),
        "validationLoss": float(val_loss),
        "productionModel": PRODUCTION_MODEL.name,
        "bestModel": BEST_MODEL.name,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
