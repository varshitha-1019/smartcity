from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "ai" / "dataset_final"
CLASSES = ["Drainage", "Garbage", "Pothole", "Water Leakage"]
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

report = {"classes": {}, "duplicateHashesAcrossClasses": []}
hash_owner = {}
for cls in CLASSES:
    folder = DATA / cls
    valid = corrupt = 0
    sizes = []
    if not folder.exists():
        report["classes"][cls] = {"missing": True}
        continue
    for p in folder.iterdir():
        if p.suffix.lower() not in EXTS:
            continue
        try:
            with Image.open(p) as im:
                sizes.append(im.size)
                im.verify()
            valid += 1
            h = hashlib.sha1(p.read_bytes()).hexdigest()
            if h in hash_owner and hash_owner[h] != cls:
                report["duplicateHashesAcrossClasses"].append([hash_owner[h], cls, p.name])
            else:
                hash_owner[h] = cls
        except Exception:
            corrupt += 1
    report["classes"][cls] = {"valid": valid, "corrupt": corrupt}

print(json.dumps(report, indent=2))
if any(v.get("missing") or v.get("valid", 0) < 50 for v in report["classes"].values()):
    raise SystemExit(2)
if report["duplicateHashesAcrossClasses"]:
    raise SystemExit(3)
