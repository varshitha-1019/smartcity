import os
import shutil
from pathlib import Path
from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS_DIR = Path(r"C:\Users\dell\.gemini\antigravity-ide\brain\7c8695d2-f221-48a2-87ac-862b1dc68e61")
DATASET_FINAL = ROOT / "ai" / "dataset_final"
WATER_DIR = DATASET_FINAL / "Water Leakage"

sources = [
    ROOT / "backend" / "uploads" / "user_water_leakage_real.jpg",
    ROOT / "backend" / "uploads" / "water_leakage_with_gps.jpg",
    ARTIFACTS_DIR / "water_pipe_leak_curb_1788803901717.jpg",
    ARTIFACTS_DIR / "water_pipe_burst_spray_1788803930952.jpg",
    ARTIFACTS_DIR / "sample_water_leakage_1788802191283.jpg",
]

existing = list(WATER_DIR.glob("*.jpg"))[:30] if WATER_DIR.exists() else []

print(f"Found {len(sources)} water leakage source files and {len(existing)} existing.")

base_images = []
for p in sources:
    if p.exists():
        im = Image.open(p).convert("RGB")
        base_images.append(im)
        w, h = im.size
        # Zoomed crops on the pipe, nozzle, spray, and water jet
        base_images.append(im.crop((int(w * 0.05), int(h * 0.15), int(w * 0.85), int(h * 0.85))))
        base_images.append(im.crop((int(w * 0.1), int(h * 0.25), int(w * 0.95), int(h * 0.95))))
        base_images.append(im.crop((0, int(h * 0.2), int(w * 0.8), int(h * 0.9))))
        base_images.append(im.crop((int(w * 0.2), int(h * 0.1), w, int(h * 0.9))))

for p in existing:
    try:
        base_images.append(Image.open(p).convert("RGB"))
    except Exception:
        pass

if not base_images:
    raise RuntimeError("No water leakage base images found.")

shutil.rmtree(WATER_DIR, ignore_errors=True)
WATER_DIR.mkdir(parents=True, exist_ok=True)

flip_lr = getattr(Image.Transpose, "FLIP_LEFT_RIGHT", getattr(Image, "FLIP_LEFT_RIGHT", 0))
resample_bilinear = getattr(Image.Resampling, "BILINEAR", getattr(Image, "BILINEAR", 2))

def generate_augmentations(img):
    aug_list = []
    aug_list.append(img)
    aug_list.append(img.transpose(flip_lr))
    for angle in [-10, -5, 5, 10]:
        r = img.rotate(angle, resample=resample_bilinear)
        aug_list.append(r)
        aug_list.append(r.transpose(flip_lr))
    w, h = img.size
    for factor in [0.8, 0.85, 0.9]:
        cw, ch = int(w * factor), int(h * factor)
        aug_list.append(img.crop(((w - cw) // 2, (h - ch) // 2, (w - cw) // 2 + cw, (h - ch) // 2 + ch)).resize((w, h), resample_bilinear))
    for b in [0.85, 0.95, 1.05, 1.15]:
        aug_list.append(ImageEnhance.Brightness(img).enhance(b))
    for c in [0.9, 1.1, 1.2]:
        aug_list.append(ImageEnhance.Contrast(img).enhance(c))
    return aug_list

count = 0
target = 150
idx = 0
while count < target:
    seed = base_images[idx % len(base_images)]
    idx += 1
    augs = generate_augmentations(seed)
    for a in augs:
        out_path = WATER_DIR / f"water_leakage_{count:04d}.jpg"
        a.resize((400, 400), Image.Resampling.LANCZOS).save(out_path, "JPEG", quality=92)
        count += 1
        if count >= target:
            break

print(f"Successfully generated {count} diverse Water Leakage training images in {WATER_DIR}")
