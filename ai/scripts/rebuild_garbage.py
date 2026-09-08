import os
import shutil
from pathlib import Path
from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS_DIR = Path(r"C:\Users\dell\.gemini\antigravity-ide\brain\eaf96480-0a2e-443f-a644-860ca4e56276")
DATASET_FINAL = ROOT / "ai" / "dataset_final"
GARBAGE_DIR = DATASET_FINAL / "Garbage"

garbage_sources = list(ARTIFACTS_DIR.glob("*garbage*.jpg"))
user_crop = ROOT / "backend" / "uploads" / "user_garbage_crop.jpg"
if user_crop.exists():
    garbage_sources.append(user_crop)

existing = list(GARBAGE_DIR.glob("*.jpg"))[:70]

print(f"Found {len(garbage_sources)} new garbage sources and {len(existing)} existing.")

base_images = []
for p in garbage_sources:
    if p.exists():
        im = Image.open(p).convert("RGB")
        base_images.append(im)
        w, h = im.size
        # Zoomed crops on drums / trash bins
        base_images.append(im.crop((int(w*0.1), int(h*0.1), int(w*0.9), int(h*0.9))))
        base_images.append(im.crop((int(w*0.15), int(h*0.2), int(w*0.85), int(h*0.8))))

for p in existing:
    try:
        base_images.append(Image.open(p).convert("RGB"))
    except:
        pass

shutil.rmtree(GARBAGE_DIR, ignore_errors=True)
GARBAGE_DIR.mkdir(parents=True, exist_ok=True)

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
        out_path = GARBAGE_DIR / f"garbage_{count:04d}.jpg"
        a.resize((400, 400), Image.Resampling.LANCZOS).save(out_path, "JPEG", quality=92)
        count += 1
        if count >= target:
            break

print(f"Successfully generated {count} Garbage training images in {GARBAGE_DIR}")
