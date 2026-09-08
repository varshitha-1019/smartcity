import os
import shutil
from pathlib import Path
# pyrefly: ignore [missing-import]
from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS_DIR = Path(r"C:\Users\dell\.gemini\antigravity-ide\brain\eaf96480-0a2e-443f-a644-860ca4e56276")
DATASET_FINAL = ROOT / "ai" / "dataset_final"
POTHOLE_DIR = DATASET_FINAL / "Pothole"

user_sources = [
    ROOT / "ai" / "user_pothole_vadlamudi.jpg",
    ROOT / "backend" / "uploads" / "user_pothole_crop.jpg",
    Path(r"C:\Users\dell\.gemini\antigravity-ide\brain\894b3925-64ac-4a6b-9dff-0845cfae2459\scratch\cropped_user_pothole.jpg"),
]

pothole_sources = [p for p in user_sources if p.exists()][:1] + list(ARTIFACTS_DIR.glob("*pothole*.jpg"))

print(f"Found {len(pothole_sources)} pothole base sources: {[p.name for p in pothole_sources]}")

base_images = []
for p in pothole_sources:
    if p.exists():
        im = Image.open(p).convert("RGB")
        base_images.append(im)
        w, h = im.size
        # Full road context avoiding bottom stamp
        base_images.append(im.crop((0, int(h * 0.05), w, int(h * 0.75))))
        # Close-up on the left-center pothole cavity
        base_images.append(im.crop((int(w * 0.10), int(h * 0.25), int(w * 0.65), int(h * 0.65))))
        # Close-up on the mid-distance cavity / depression
        base_images.append(im.crop((int(w * 0.25), int(h * 0.15), int(w * 0.85), int(h * 0.50))))
        # General zoomed crop
        base_images.append(im.crop((int(w * 0.15), int(h * 0.20), int(w * 0.85), int(h * 0.80))))
        base_images.append(im.crop((0, int(h * 0.10), int(w * 0.80), int(h * 0.90))))

# Keep real texture crops from legacy dataset/Pothole
legacy_dir = ROOT / "dataset" / "Pothole"
if legacy_dir.exists():
    for f in list(legacy_dir.glob("*.jpg"))[:40]:
        try:
            base_images.append(Image.open(f).convert("RGB"))
        except Exception:
            pass

shutil.rmtree(POTHOLE_DIR, ignore_errors=True)
POTHOLE_DIR.mkdir(parents=True, exist_ok=True)

flip_lr = getattr(Image.Transpose, "FLIP_LEFT_RIGHT", getattr(Image, "FLIP_LEFT_RIGHT", 0))
resample_bilinear = getattr(Image.Resampling, "BILINEAR", getattr(Image, "BILINEAR", 2))

def generate_augmentations(img):
    aug_list = []
    aug_list.append(img)
    aug_list.append(img.transpose(flip_lr))
    for angle in [-8, -4, 4, 8]:
        r = img.rotate(angle, resample=resample_bilinear)
        aug_list.append(r)
        aug_list.append(r.transpose(flip_lr))
    w, h = img.size
    for factor in [0.85, 0.9]:
        cw, ch = int(w * factor), int(h * factor)
        aug_list.append(img.crop(((w-cw)//2, (h-ch)//2, (w-cw)//2 + cw, (h-ch)//2 + ch)).resize((w, h), resample_bilinear))
    for b in [0.85, 0.95, 1.1, 1.2]:
        aug_list.append(ImageEnhance.Brightness(img).enhance(b))
    return aug_list

count = 0
target = 150
idx = 0
while count < target:
    seed = base_images[idx % len(base_images)]
    idx += 1
    augs = generate_augmentations(seed)
    for a in augs:
        out_path = POTHOLE_DIR / f"pothole_{count:04d}.jpg"
        a.resize((400, 400), Image.Resampling.LANCZOS).save(out_path, "JPEG", quality=92)
        count += 1
        if count >= target:
            break

print(f"Successfully generated {count} Pothole training images in {POTHOLE_DIR}")
