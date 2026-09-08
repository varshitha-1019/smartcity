import os
import shutil
from pathlib import Path
from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS_DIR = Path(r"C:\Users\dell\.gemini\antigravity-ide\brain\eaf96480-0a2e-443f-a644-860ca4e56276")
DATASET_FINAL = ROOT / "ai" / "dataset_final"
HUMAN_DIR = DATASET_FINAL / "Human"

human_sources = list(ARTIFACTS_DIR.glob("*selfie*.jpg"))
scratch = ROOT / "ai" / "scratch_selfie.jpg"
if scratch.exists():
    human_sources.append(scratch)

# Also preserve 30 existing human images
existing = list(HUMAN_DIR.glob("*.jpg"))[:30]

print(f"Found {len(human_sources)} new human sources and {len(existing)} existing.")

base_images = []
for p in human_sources:
    if p.exists():
        im = Image.open(p).convert("RGB")
        base_images.append(im)
        w, h = im.size
        # Face / head crop
        base_images.append(im.crop((int(w*0.1), 0, int(w*0.9), int(h*0.8))))
        base_images.append(im.crop((int(w*0.2), int(h*0.05), int(w*0.8), int(h*0.75))))

for p in existing:
    try:
        base_images.append(Image.open(p).convert("RGB"))
    except:
        pass

shutil.rmtree(HUMAN_DIR, ignore_errors=True)
HUMAN_DIR.mkdir(parents=True, exist_ok=True)

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
        out_path = HUMAN_DIR / f"human_{count:04d}.jpg"
        a.resize((400, 400), Image.Resampling.LANCZOS).save(out_path, "JPEG", quality=92)
        count += 1
        if count >= target:
            break

print(f"Successfully generated {count} Human training images in {HUMAN_DIR}")
