# SmartCity AI Corrected Package

This package fixes the main causes of "everything predicts Pothole":

1. **Stale model loading**: inference now prefers `ai/model/best_model.keras`, and training copies that exact best checkpoint to `urban_issue_classifier.keras`.
2. **Fixed class order**: one stable mapping is used everywhere: `Drainage, Garbage, Pothole, Water Leakage`.
3. **Mixed dataset formats**: `prepare_dataset.py` converts the supplied Pascal-VOC, Roboflow multiclass and YOLO exports into one image-classification dataset.
4. **Bad normal examples are excluded**: Drainage `clear` and Water `no leak` are *not* trained as issue images.
5. **Class imbalance**: training uses class weights instead of letting the largest dataset dominate.
6. **No forced Pothole fallback**: low-confidence/low-margin predictions become `Unknown` with `UNCERTAIN` or `REJECTED` status.

## Put these 4 dataset ZIPs in the project root

- `archive.zip` (Pothole)
- `garbage.v1i.multiclass.zip`
- `Drainage.v1i.yolov8.zip`
- `pipeline_leakage1.v1i.yolov8.zip`

`water leakage.zip` and `archive (2).zip` are not required by the automated pipeline because the larger structured exports above are cleaner for this retraining flow.

## Windows steps

1. Double-click `ai/prepare_dataset.bat`.
2. Check the printed counts and `ai/dataset_final/dataset_report.json`.
3. Double-click `ai/train_model.bat`.
4. After training, verify these files changed:
   - `ai/model/best_model.keras`
   - `ai/model/urban_issue_classifier.keras`
   - `ai/model/model_manifest.json`
5. Restart the Node backend. A running backend process will not automatically reload Python/model changes already cached by surrounding infrastructure.

## Manual commands

```bat
python ai\scripts\prepare_dataset.py --pothole "archive.zip" --garbage "garbage.v1i.multiclass.zip" --drainage "Drainage.v1i.yolov8.zip" --water "pipeline_leakage1.v1i.yolov8.zip" --output ai\dataset_final --overwrite
python ai\scripts\audit_dataset.py
python ai\scripts\train.py
python ai\scripts\predict.py "path\to\test-image.jpg"
```

## Expected prediction JSON

A confident result is `VALID`. Weak predictions are never auto-routed:

```json
{
  "category": "Garbage",
  "topCategory": "Garbage",
  "confidence": 0.91,
  "margin": 0.72,
  "status": "VALID"
}
```

or:

```json
{
  "category": "Unknown",
  "topCategory": "Pothole",
  "confidence": 0.43,
  "status": "UNCERTAIN"
}
```

## Important

Do not judge the fix using the old model already present in the ZIP. The corrected **code** is included here, but the model must be retrained on the prepared dataset on your machine. Training is the step that replaces the stale/biased model weights.
