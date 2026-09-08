# Model files in this directory

- **`urban_issue_classifier.keras`** — the PRODUCTION model. This is the
  only file `ai/scripts/predict.py` loads at inference time (see
  `MODEL_PATH` in that script). `class_names.json` describes this file's
  output order.
- **`best_model.keras`** — a TRAINING CHECKPOINT only (written by
  `keras.callbacks.ModelCheckpoint(..., save_best_only=True)` in
  `ai/scripts/train.py` / `train_classifier.py`, keyed on `val_accuracy`).
  It is not read by any inference or backend code. It is kept only so a
  training run can be resumed/inspected; it is not guaranteed to be
  byte-identical to `urban_issue_classifier.keras` (the final `model.save()`
  call after training completes), since `train.py` does not pass
  `restore_best_weights=True` to `EarlyStopping`. If you retrain, decide
  deliberately whether the final saved model or the best checkpoint should
  become the new `urban_issue_classifier.keras` - do not leave the two
  silently out of sync with each other.
- **`class_names.json`** — `["Drainage", "Garbage", "Pothole", "Water Leakage"]`,
  in the exact index order the production model's softmax output uses.
  This project has NOT been retrained as part of this change set (no
  dataset was available - see `ai/README_DATASET.md`), so this file is
  unchanged from what was already in the project.
