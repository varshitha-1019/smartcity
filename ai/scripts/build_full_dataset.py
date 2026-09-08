"""Build a rich, diverse dataset in ai/dataset_final covering all 6 categories:
1. Garbage (Litter, plastic, food waste, bins on streets)
2. Water Leakage (Burst pipes, water spray, street flow, flooded asphalt)
3. Drainage (Blocked gutters, clogged storm drains, open ditches)
4. Pothole (Asphalt depth, broken surface, road craters)
5. Normal Road (Clean, smooth, well-maintained pavement)
6. Human (People on street, selfies, pedestrians)
"""

import os
import sys
import shutil
from pathlib import Path
from PIL import Image, ImageEnhance

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore

ROOT = Path(__file__).resolve().parents[2]
DATASET_FINAL = ROOT / "ai" / "dataset_final"
BACKEND_DIR = ROOT / "backend"

BRAIN_DIRS = [
    Path(r"C:\Users\dell\.gemini\antigravity-ide\brain\7c8695d2-f221-48a2-87ac-862b1dc68e61"),
    Path(r"C:\Users\dell\.gemini\antigravity-ide\brain\eaf96480-0a2e-443f-a644-860ca4e56276"),
    Path(r"C:\Users\dell\.gemini\antigravity-ide\brain\a409c871-3bf0-4ecb-8e30-cfa9d474f23b"),
]

flip_lr = Image.Transpose.FLIP_LEFT_RIGHT
resample_bilinear = Image.Resampling.BILINEAR
resample_lanczos = Image.Resampling.LANCZOS

def generate_augmentations(im: Image.Image) -> list:
    augmented = [im]
    augmented.append(im.transpose(flip_lr))

    for angle in [-10, -6, -3, 3, 6, 10]:
        r = im.rotate(angle, resample=resample_bilinear)
        augmented.append(r)
        augmented.append(r.transpose(flip_lr))

    w, h = im.size
    for factor in [0.85, 0.9, 0.95]:
        cw, ch = int(w * factor), int(h * factor)
        left = (w - cw) // 2
        top = (h - ch) // 2
        augmented.append(im.crop((left, top, left + cw, top + ch)).resize((w, h), resample_bilinear))
        augmented.append(im.crop((0, 0, cw, ch)).resize((w, h), resample_bilinear))
        augmented.append(im.crop((w - cw, h - ch, w, h)).resize((w, h), resample_bilinear))

    for b in [0.85, 0.95, 1.08, 1.18]:
        augmented.append(ImageEnhance.Brightness(im).enhance(b))

    for c in [0.9, 1.1, 1.25]:
        augmented.append(ImageEnhance.Contrast(im).enhance(c))

    return augmented

CATEGORY_KEYWORDS = {
    "Garbage": ["garbage", "trash", "litter", "dustbin"],
    "Water Leakage": ["water_leak", "pipe_burst", "pipe_leak", "water_pipe", "user_water_leakage"],
    "Drainage": ["drain", "gutter", "sewage", "canal"],
    "Pothole": ["pothole", "road_damage", "crater"],
    "Normal Road": ["normal_road", "clean_street", "clean_road"],
    "Human": ["human", "selfie", "person", "pedestrian"],
}

def collect_seeds_for_category(category_name: str) -> list:
    keywords = CATEGORY_KEYWORDS.get(category_name, [category_name.lower()])
    seeds = []

    # 1. Search brain artifact directories
    for bdir in BRAIN_DIRS:
        if bdir.exists():
            for f in bdir.glob("*.*"):
                if f.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]:
                    fname = f.name.lower()
                    if any(k in fname for k in keywords):
                        try:
                            im = Image.open(f).convert("RGB")
                            seeds.append(im)
                            # Also add center/lower crops for rich features
                            w, h = im.size
                            seeds.append(im.crop((int(w*0.1), int(h*0.1), int(w*0.9), int(h*0.9))))
                            seeds.append(im.crop((int(w*0.15), int(h*0.25), int(w*0.85), int(h*0.85))))
                        except Exception:
                            pass

    # 2. Search backend sample test images and uploads
    for search_dir in [BACKEND_DIR / "sample_test_images", BACKEND_DIR / "uploads"]:
        if search_dir.exists():
            for f in search_dir.glob("*.*"):
                if f.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]:
                    fname = f.name.lower()
                    if any(k in fname for k in keywords):
                        try:
                            im = Image.open(f).convert("RGB")
                            seeds.append(im)
                            w, h = im.size
                            seeds.append(im.crop((int(w*0.1), int(h*0.1), int(w*0.9), int(h*0.9))))
                        except Exception:
                            pass

    # 3. Existing images in dataset_final as additional seed variety
    existing_dir = DATASET_FINAL / category_name
    if existing_dir.exists():
        existing_imgs = list(existing_dir.glob("*.jpg"))[:30]
        for f in existing_imgs:
            try:
                seeds.append(Image.open(f).convert("RGB"))
            except Exception:
                pass

    return seeds

def build_category(category_name: str, target_count: int = 150):
    cat_dir = DATASET_FINAL / category_name
    seeds = collect_seeds_for_category(category_name)
    print(f"[{category_name}] Found {len(seeds)} base seed variations.")

    if not seeds:
        print(f"[{category_name}] Warning: No seeds found, preserving existing directory.")
        return

    # Backup & recreate directory
    temp_dir = DATASET_FINAL / f"{category_name}_new"
    temp_dir.mkdir(parents=True, exist_ok=True)

    count = 0
    idx = 0
    while count < target_count:
        seed = seeds[idx % len(seeds)]
        idx += 1
        augs = generate_augmentations(seed)
        for a in augs:
            out_file = temp_dir / f"{category_name.lower().replace(' ', '_')}_{count:04d}.jpg"
            a.resize((400, 400), resample_lanczos).save(out_file, "JPEG", quality=92)
            count += 1
            if count >= target_count:
                break

    # Replace old dir with new balanced set
    shutil.rmtree(cat_dir, ignore_errors=True)
    temp_dir.rename(cat_dir)
    print(f"[{category_name}] Successfully generated {target_count} images.")

def main():
    DATASET_FINAL.mkdir(parents=True, exist_ok=True)
    categories = [
        "Garbage",
        "Water Leakage",
        "Drainage",
        "Pothole",
        "Normal Road",
        "Human",
    ]

    for cat in categories:
        build_category(cat, target_count=150)

    print("\nBalanced dataset rebuild completed successfully!")

if __name__ == "__main__":
    main()
