"""Build a clean 4-class classification dataset from the user's mixed exports.

Supported sources used by this project:
- Pothole: Pascal VOC archive (archive.zip), annotated-images/*.jpg + *.xml
- Garbage: Roboflow multiclass archive (garbage.v1i.multiclass.zip)
- Drainage: YOLO archive (Drainage.v1i.yolov8.zip), keep Floaters positives only
- Water Leakage: YOLO archive (pipeline_leakage1.v1i.yolov8.zip), keep leak/water positives only

The output is image-level classification data:
  ai/dataset_final/{Drainage,Garbage,Pothole,Water Leakage}/...

We intentionally exclude YOLO negative/normal labels such as Drainage 'clear'
and Water Leakage 'no leak'; teaching those images as civic issues would poison a
closed-set classifier and can cause confident misclassification.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
import shutil
import tempfile
import zipfile
from collections import Counter
from pathlib import Path
from typing import Iterable

from PIL import Image

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
CLASSES = ["Drainage", "Garbage", "Pothole", "Water Leakage"]


def image_ok(path: Path, min_side: int = 120) -> bool:
    try:
        with Image.open(path) as img:
            img.verify()
        with Image.open(path) as img:
            return min(img.size) >= min_side
    except Exception:
        return False


def safe_extract(zip_path: Path, target: Path) -> None:
    with zipfile.ZipFile(zip_path) as zf:
        root = target.resolve()
        for member in zf.infolist():
            out = (target / member.filename).resolve()
            if root != out and root not in out.parents:
                raise RuntimeError(f"Unsafe ZIP path: {member.filename}")
        zf.extractall(target)


def all_images(root: Path) -> list[Path]:
    return [p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTS]


def copy_unique(paths: Iterable[Path], out_dir: Path, prefix: str, max_count: int | None, seed: int) -> int:
    candidates = [p for p in paths if image_ok(p)]
    rng = random.Random(seed)
    rng.shuffle(candidates)
    if max_count and max_count > 0:
        candidates = candidates[:max_count]
    out_dir.mkdir(parents=True, exist_ok=True)
    copied = 0
    hashes: set[str] = set()
    for src in candidates:
        digest = hashlib.sha1(src.read_bytes()).hexdigest()
        if digest in hashes:
            continue
        hashes.add(digest)
        dst = out_dir / f"{prefix}_{copied:05d}{src.suffix.lower()}"
        shutil.copy2(src, dst)
        copied += 1
    return copied


def find_label_for_image(image_path: Path, root: Path) -> Path | None:
    parts = list(image_path.parts)
    try:
        idx = parts.index("images")
        label_parts = parts[:]
        label_parts[idx] = "labels"
        return Path(*label_parts).with_suffix(".txt")
    except ValueError:
        # Fallback for odd exports.
        matches = list(root.rglob(image_path.stem + ".txt"))
        return matches[0] if matches else None


def yolo_class_ids(label_path: Path | None) -> set[int]:
    ids: set[int] = set()
    if not label_path or not label_path.exists():
        return ids
    for raw in label_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        parts = raw.strip().split()
        if not parts:
            continue
        try:
            ids.add(int(float(parts[0])))
        except ValueError:
            pass
    return ids


def collect_pothole(root: Path) -> list[Path]:
    annotated = root / "annotated-images"
    if not annotated.exists():
        candidates = [p for p in root.rglob("annotated-images") if p.is_dir()]
        if candidates:
            annotated = candidates[0]
    return [p for p in all_images(annotated) if p.with_suffix(".xml").exists()]


def collect_garbage(root: Path) -> list[Path]:
    # All images in this export are garbage images; _classes.csv contains
    # severity labels (high/low/midium), not SmartCity issue categories.
    return all_images(root)


def collect_yolo_positive(root: Path, positive_ids: set[int]) -> list[Path]:
    selected: list[Path] = []
    for img in all_images(root):
        label = find_label_for_image(img, root)
        if yolo_class_ids(label) & positive_ids:
            selected.append(img)
    return selected


def write_report(out_root: Path, counts: dict[str, int], sources: dict[str, str]) -> None:
    report = {
        "classes": CLASSES,
        "counts": counts,
        "sources": sources,
        "notes": [
            "Drainage keeps YOLO class 0 (Floaters) and excludes class 1 (clear).",
            "Water Leakage keeps YOLO classes 1 (leak) and 3 (water), excludes class 2 (no leak).",
            "Garbage severity labels are ignored because the SmartCity task is only issue category classification.",
            "Pothole uses full annotated images so inference matches citizen full-photo uploads.",
        ],
    }
    (out_root / "dataset_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pothole", required=True, type=Path)
    parser.add_argument("--garbage", required=True, type=Path)
    parser.add_argument("--drainage", required=True, type=Path)
    parser.add_argument("--water", required=True, type=Path)
    parser.add_argument("--output", type=Path, default=Path("ai/dataset_final"))
    parser.add_argument("--max-per-class", type=int, default=0, help="0 = keep all valid images")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    if args.output.exists() and args.overwrite:
        shutil.rmtree(args.output)
    args.output.mkdir(parents=True, exist_ok=True)

    for source in (args.pothole, args.garbage, args.drainage, args.water):
        if not source.exists():
            raise FileNotFoundError(source)

    max_count = args.max_per_class if args.max_per_class > 0 else None
    counts: dict[str, int] = {}
    sources = {
        "Pothole": str(args.pothole),
        "Garbage": str(args.garbage),
        "Drainage": str(args.drainage),
        "Water Leakage": str(args.water),
    }

    with tempfile.TemporaryDirectory(prefix="smartcity_dataset_") as tmp:
        tmp = Path(tmp)
        extracted: dict[str, Path] = {}
        for name, source in [("pothole", args.pothole), ("garbage", args.garbage), ("drainage", args.drainage), ("water", args.water)]:
            target = tmp / name
            target.mkdir(parents=True)
            if source.suffix.lower() == ".zip":
                safe_extract(source, target)
            elif source.is_dir():
                target = source
            else:
                raise ValueError(f"Expected ZIP or directory: {source}")
            extracted[name] = target

        collections = {
            "Pothole": collect_pothole(extracted["pothole"]),
            "Garbage": collect_garbage(extracted["garbage"]),
            "Drainage": collect_yolo_positive(extracted["drainage"], {0}),
            "Water Leakage": collect_yolo_positive(extracted["water"], {1, 3}),
        }

        for i, class_name in enumerate(CLASSES):
            paths = collections[class_name]
            if not paths:
                raise RuntimeError(f"No usable {class_name} images found. Check the supplied archive format.")
            counts[class_name] = copy_unique(paths, args.output / class_name, class_name.replace(" ", "_"), max_count, args.seed + i)

    write_report(args.output, counts, sources)
    print("Prepared SmartCity classification dataset:")
    for name in CLASSES:
        print(f"  {name:14s}: {counts[name]}")
    print(f"Report: {args.output / 'dataset_report.json'}")


if __name__ == "__main__":
    main()
