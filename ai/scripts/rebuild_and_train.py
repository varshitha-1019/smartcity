import os
import shutil
import glob
from pathlib import Path
# pyrefly: ignore [missing-import]
from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS_DIR = Path(r"C:\Users\dell\.gemini\antigravity-ide\brain\a409c871-3bf0-4ecb-8e30-cfa9d474f23b")
DATASET_FINAL = ROOT / "ai" / "dataset_final"
DRAINAGE_DIR = DATASET_FINAL / "Drainage"

# Real-world drainage base images
drainage_sources = [
    ROOT / "backend" / "uploads" / "1788721565385-601837779.png", # User's actual uploaded drainage
] + list(ARTIFACTS_DIR.glob("*drain*.jpg"))

print(f"Found {len(drainage_sources)} real drainage base images:")
for s in drainage_sources:
    print(" -", s.name)

# Clear old synthetic white-background drainage images
shutil.rmtree(DRAINAGE_DIR, ignore_errors=True)
DRAINAGE_DIR.mkdir(parents=True, exist_ok=True)

flip_lr = getattr(Image.Transpose, "FLIP_LEFT_RIGHT", getattr(Image, "FLIP_LEFT_RIGHT", 0))
resample_bilinear = getattr(Image.Resampling, "BILINEAR", getattr(Image, "BILINEAR", 2))

def generate_augmentations(img):
    aug_list = []
    # 1. Original
    aug_list.append(img)
    # 2. Horizontal flip
    aug_list.append(img.transpose(flip_lr))
    
    # 3. Rotations
    for angle in [-10, -5, 5, 10]:
        r = img.rotate(angle, resample=resample_bilinear)
        aug_list.append(r)
        aug_list.append(r.transpose(flip_lr))
        
    # 4. Crops and zooms
    w, h = img.size
    for factor in [0.8, 0.85, 0.9]:
        cw, ch = int(w * factor), int(h * factor)
        # Center
        aug_list.append(img.crop(((w-cw)//2, (h-ch)//2, (w-cw)//2 + cw, (h-ch)//2 + ch)).resize((w, h), resample_bilinear))
        # Top-left
        aug_list.append(img.crop((0, 0, cw, ch)).resize((w, h), resample_bilinear))
        # Bottom-right
        aug_list.append(img.crop((w-cw, h-ch, w, h)).resize((w, h), resample_bilinear))
        # Bottom-left (focus on drain ditch)
        aug_list.append(img.crop((0, h-ch, cw, h)).resize((w, h), resample_bilinear))

    # 5. Brightness and contrast
    for b in [0.85, 0.95, 1.1, 1.2]:
        aug_list.append(ImageEnhance.Brightness(img).enhance(b))
    for c in [0.9, 1.15, 1.25]:
        aug_list.append(ImageEnhance.Contrast(img).enhance(c))
        
    return aug_list

# Generate 150 real drainage training images
count = 0
target = 150
base_images = []
for p in drainage_sources:
    if p.exists():
        im = Image.open(p).convert("RGB")
        # For the user's photo with a GPS stamp box at the bottom, generate crops focusing on the drain
        if "1788721565385" in p.name:
            w, h = im.size
            # Crop out the bottom corner stamp
            drain_crop1 = im.crop((int(w*0.05), int(h*0.25), int(w*0.95), int(h*0.82)))
            drain_crop2 = im.crop((int(w*0.10), int(h*0.35), int(w*0.90), int(h*0.85)))
            drain_crop3 = im.crop((int(w*0.05), int(h*0.15), int(w*0.75), int(h*0.90)))
            base_images.extend([im, drain_crop1, drain_crop2, drain_crop3])
        else:
            base_images.append(im)

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

print(f"Generated {count} real-world Drainage training images in {DRAINAGE_DIR}")
