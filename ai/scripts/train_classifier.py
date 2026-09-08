# SUPERSEDED by ai/scripts/train.py.
#
# This is an earlier version of the training pipeline, kept only for
# reference. It predates the fix (documented in train.py) for the
# central_crop(0.82)-caused drainage/pothole confusion, and it hardcodes
# "ai/dataset_final" instead of respecting AI_DATASET_DIR. Do not use this
# script to retrain the production model - use ai/scripts/train.py so the
# model/class metadata stays a single, non-contradictory source of truth
# (see ai/model/urban_issue_classifier.keras versioning notes in the final
# report).
import os
import json
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers

DATASET_DIR = "ai/dataset_final"
MODEL_DIR = "ai/model"

IMG_SIZE = (224, 224)
BATCH_SIZE = 32
SEED = 42
EPOCHS = 5
CLASS_NAMES = ["Drainage", "Garbage", "Pothole", "Water Leakage"]

os.makedirs(MODEL_DIR, exist_ok=True)

train_ds = tf.keras.utils.image_dataset_from_directory(
    DATASET_DIR,
    class_names=CLASS_NAMES,
    validation_split=0.20,
    subset="training",
    seed=SEED,
    image_size=IMG_SIZE,
    batch_size=BATCH_SIZE,
)

val_ds = tf.keras.utils.image_dataset_from_directory(
    DATASET_DIR,
    class_names=CLASS_NAMES,
    validation_split=0.20,
    subset="validation",
    seed=SEED,
    image_size=IMG_SIZE,
    batch_size=BATCH_SIZE,
)

class_names = train_ds.class_names

print("Classes:", class_names)

AUTOTUNE = tf.data.AUTOTUNE

train_ds = train_ds.prefetch(AUTOTUNE)
val_ds = val_ds.prefetch(AUTOTUNE)

data_augmentation = keras.Sequential([
    layers.RandomFlip("horizontal"),
    layers.RandomRotation(15 / 360),  # +/-15 degrees
    layers.RandomZoom(height_factor=(-0.2, 0.2), width_factor=(-0.2, 0.2)),  # 0.8x-1.2x
    layers.RandomBrightness(0.15),
])

base_model = tf.keras.applications.MobileNetV2(
    input_shape=IMG_SIZE + (3,),
    include_top=False,
    weights="imagenet",
)

base_model.trainable = False

inputs = keras.Input(shape=IMG_SIZE + (3,))
x = data_augmentation(inputs)
x = tf.keras.applications.mobilenet_v2.preprocess_input(x)
x = base_model(x, training=False)
x = layers.GlobalAveragePooling2D()(x)
x = layers.Dropout(0.2)(x)
outputs = layers.Dense(len(class_names), activation="softmax")(x)

model = keras.Model(inputs, outputs)

model.compile(
    optimizer=keras.optimizers.Adam(learning_rate=0.001),
    loss="sparse_categorical_crossentropy",
    metrics=["accuracy"],
)

model.summary()

callbacks = [
    keras.callbacks.EarlyStopping(
        monitor="val_accuracy",
        patience=2,
        restore_best_weights=True,
    ),
    keras.callbacks.ModelCheckpoint(
        "ai/model/best_model.keras",
        monitor="val_accuracy",
        save_best_only=True,
    ),
]

history = model.fit(
    train_ds,
    validation_data=val_ds,
    epochs=EPOCHS,
    callbacks=callbacks,
)

model.save("ai/model/urban_issue_classifier.keras")

with open("ai/model/class_names.json", "w") as f:
    json.dump(class_names, f)

print("Training complete.")
print("Model saved to ai/model/urban_issue_classifier.keras")
print("Classes saved to ai/model/class_names.json")