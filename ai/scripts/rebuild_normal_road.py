import os
import shutil
from pathlib import Path
from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[2]
CURRENT_ARTIFACTS = Path(r"C:\Users\dell\.gemini\antigravity-ide\brain\eaf96480-0a2e-443f-a644-860ca4e56276")
DATASET_FINAL = ROOT / "ai" / "dataset_final"
ROAD_DIR = DATASET_FINAL / "Normal Road"

# Strictly select genuine normal road images, NEVER potholes/drainage/garbage/human
clean_road_patterns = ["*highway*.jpg", "*road_scene*.jpg", "*normal_road*.jpg", "*street*.jpg"]
artifact_roads = []
for pat in clean_road_patterns:
    artifact_roads.extend(CURRENT_ARTIFACTS.glob(pat))

road_sources = [
    ROOT / "backend" / "uploads" / "1788723527714-851427913.png",
] + [p for p in artifact_roads if not any(bad in p.name.lower() for bad in ["pothole", "drain", "garbage", "selfie", "human"])]

print(f"Found clean road sources: {[s.name for s in road_sources]}")

shutil.rmtree(ROAD_DIR, ignore_errors=True)
ROAD_DIR.mkdir(parents=True, exist_ok=True)

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
    for factor in [0.8, 0.85, 0.9]:
        cw, ch = int(w * factor), int(h * factor)
        aug_list.append(img.crop(((w-cw)//2, (h-ch)//2, (w-cw)//2 + cw, (h-ch)//2 + ch)).resize((w, h), resample_bilinear))
        aug_list.append(img.crop((0, 0, cw, ch)).resize((w, h), resample_bilinear))
        aug_list.append(img.crop((w-cw, h-ch, w, h)).resize((w, h), resample_bilinear))
    for b in [0.85, 0.95, 1.1, 1.2]:
        aug_list.append(ImageEnhance.Brightness(img).enhance(b))
    for c in [0.9, 1.1, 1.2]:
        aug_list.append(ImageEnhance.Contrast(img).enhance(c))
    return aug_list

base_images = []
for p in road_sources:
    if p.exists():
        im = Image.open(p).convert("RGB")
        w, h = im.size
        if "1788723527714" in p.name:
            # User's uploaded road image: create crops covering upper road, mid-road, roadside gravel
            c1 = im.crop((0, 0, w, int(h * 0.75)))
            c2 = im.crop((int(w * 0.05), int(h * 0.15), int(w * 0.95), int(h * 0.75)))
            c3 = im.crop((0, int(h * 0.10), w, int(h * 0.65)))
            c4 = im.crop((int(w * 0.10), int(h * 0.20), int(w * 0.90), int(h * 0.70)))
            base_images.extend([c1, c2, c3, c4])
        else:
            base_images.append(im)
            # Add crops
            base_images.append(im.crop((0, int(h * 0.2), w, h)))
            base_images.append(im.crop((int(w * 0.1), int(h * 0.1), int(w * 0.9), int(h * 0.9))))

# Also include a few clean asphalt crops from dataset/Normal_Road
legacy_dir = ROOT / "dataset" / "Normal_Road"
if legacy_dir.exists():
    for f in list(legacy_dir.glob("*.jpg"))[:20]:
        base_images.append(Image.open(f).convert("RGB"))

count = 0
target = 150
idx = 0
while count < target:
    seed = base_images[idx % len(base_images)]
    idx += 1
    augs = generate_augmentations(seed)
    for a in augs:
        out_path = ROAD_DIR / f"normal_road_{count:04d}.jpg"
        a.resize((400, 400), Image.Resampling.LANCZOS).save(out_path, "JPEG", quality=92)
        count += 1
        if count >= target:
            break

print(f"Successfully generated {count} Normal Road training images in {ROAD_DIR}")
