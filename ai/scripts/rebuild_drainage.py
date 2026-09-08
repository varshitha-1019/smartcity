import os
import shutil
from pathlib import Path
# pyrefly: ignore [missing-import]
from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS_DIR = Path(r"C:\Users\dell\.gemini\antigravity-ide\brain\eaf96480-0a2e-443f-a644-860ca4e56276")
DATASET_FINAL = ROOT / "ai" / "dataset_final"
DRAINAGE_DIR = DATASET_FINAL / "Drainage"

drainage_sources = [
    ROOT / "backend" / "uploads" / "user_drainage_crop.jpg",
    ROOT / "backend" / "uploads" / "1788721565385-601837779.png",
] + (list(ARTIFACTS_DIR.glob("*drain*.jpg")) if ARTIFACTS_DIR.exists() else [])

existing = list(DRAINAGE_DIR.glob("*.jpg"))[:60]

print(f"Found {len(drainage_sources)} drainage sources and {len(existing)} existing.")

base_images = []
for p in drainage_sources:
    if p.exists():
        im = Image.open(p).convert("RGB")
        base_images.append(im)
        w, h = im.size
        # Zoomed crops on pipe and drain channel
        base_images.append(im.crop((int(w*0.05), int(h*0.2), int(w*0.95), int(h*0.85))))
        base_images.append(im.crop((int(w*0.1), int(h*0.3), int(w*0.9), int(h*0.9))))
        base_images.append(im.crop((0, int(h*0.25), int(w*0.85), int(h*0.85))))

for p in existing:
    try:
        base_images.append(Image.open(p).convert("RGB"))
    except Exception:
        pass

if not base_images:
    raise RuntimeError("No drainage base images found to generate augmentations.")

shutil.rmtree(DRAINAGE_DIR, ignore_errors=True)
DRAINAGE_DIR.mkdir(parents=True, exist_ok=True)

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
        out_path = DRAINAGE_DIR / f"drainage_{count:04d}.jpg"
        a.resize((400, 400), Image.Resampling.LANCZOS).save(out_path, "JPEG", quality=92)
        count += 1
        if count >= target:
            break

print(f"Successfully generated {count} Drainage training images in {DRAINAGE_DIR}")
