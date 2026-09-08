# Dataset status: MISSING — required before real retraining can happen

This ZIP does not contain an `ai/dataset_final/` directory (or any other
training images). `git log`/comments in `train.py` and `train_classifier.py`
reference `ai/dataset_final` as the expected training data location, but it
was not included in the project archive that was provided.

**Nothing in this project has been retrained.** `ai/model/urban_issue_classifier.keras`
and `ai/model/best_model.keras` are exactly the files that were already in
the ZIP. Any claim of retraining, a new accuracy number, a confusion matrix,
or per-class precision/recall would have to be fabricated without real data
to run through `ai/scripts/train.py` / `ai/scripts/evaluate.py` — which this
project explicitly must never do.

## What is needed to actually fix the drainage/pothole confusion and add
## real rejection of irrelevant images

### 1. The four supported-class folders (for fine-tuning / re-validating the existing model)

```
ai/dataset_final/
├── Drainage/*.jpg
├── Garbage/*.jpg
├── Pothole/*.jpg
└── Water Leakage/*.jpg
```

Especially for `Drainage`: the training scripts already fixed one root
cause found during this audit (an unconditional `central_crop(0.82)` that
threw away the water body/banks/pipe context that makes a drainage photo
recognizable as drainage instead of "a patch of wet ground" — see the
comment at the top of `train.py::build_model`). To finish the fix, the
actual `Drainage` folder needs genuinely diverse photos (different angles,
lighting, drain types, severities, backgrounds) — that diversity can't be
manufactured; it has to come from real field photos.

### 2. A negative/"not a civic issue" dataset (for a real relevance/OOD stage)

```
ai/dataset_final_negative/
├── hands/*.jpg
├── people/*.jpg
├── faces/*.jpg
├── animals/*.jpg
├── indoor_rooms/*.jpg
├── furniture/*.jpg
├── phones_computers/*.jpg
├── random_objects/*.jpg
├── sky/*.jpg
├── trees/*.jpg
├── buildings_no_issue/*.jpg
├── vehicles_no_damage/*.jpg
├── normal_roads/*.jpg
├── normal_streets/*.jpg
├── normal_sidewalks/*.jpg
├── unrelated_photos/*.jpg
└── blurry_irrelevant/*.jpg
```

This folder does not exist anywhere in the current repository. Without it,
there is no way to train either (a) a separate Stage-1 "civic issue vs not"
classifier, or (b) a 5th "Unknown" class inside the existing classifier.
Everything currently protecting against a hand/person/random-object photo
being misclassified as a civic issue (`ai/scripts/predict.py`'s confidence +
margin thresholds) is a **statistical heuristic on top of the same 4-class
model**, not a trained relevance detector — see the docstring at the top of
`predict.py` for exactly what that heuristic can and cannot catch, and why
it is not a substitute for this dataset.

### 3. A small held-out test set, disjoint from training/validation

Grouped by capture session/location so near-duplicate frames from the same
photo burst don't leak between train and test (Step 4 of the brief). This
also does not exist yet — `train.py`/`train_classifier.py` currently only do
a random 80/20 `image_dataset_from_directory` split with no session
grouping, because there is no session/location metadata anywhere in the
dataset to group by. If the real dataset comes with e.g. filename or folder
conventions that identify capture sessions, that grouping logic should be
added to the split step before retraining.

## Environment constraint (also worth knowing)

This sandbox has network access to PyPI only. `pip install tensorflow` would
work, but `tf.keras.applications.MobileNetV2(weights="imagenet")` downloads
pretrained ImageNet weights from `storage.googleapis.com`, which is not on
this environment's allowlist. So even with a dataset, the transfer-learning
base in `train.py`/`train_classifier.py` could not actually be fine-tuned
from this sandbox — training would need to run in an environment with
access to the Keras/TensorFlow weights CDN (or the weights file pre-cached
locally).

## What to do once the dataset above exists

1. Run `python ai/scripts/train.py` (point `AI_DATASET_DIR` at the real
   `ai/dataset_final`) to fine-tune the 4-class model — this part of the
   pipeline is otherwise ready.
2. Extend it with the negative dataset (either a second Stage-1 model, or an
   `Unknown` folder added into the same `image_dataset_from_directory` call
   with a 5th `Unknown` class name) so the model actually learns what a
   civic issue does *not* look like, instead of relying only on
   `predict.py`'s confidence/margin heuristic.
3. Run `python ai/scripts/evaluate.py` (added in this change set) against
   the held-out test set to get real accuracy/precision/recall/F1/confusion
   matrix numbers, including the negative-class false-acceptance rate. Do
   not report any number that script did not actually produce.
