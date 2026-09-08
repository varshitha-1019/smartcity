"""Extract and organize dataset archives into the dataset/ directory."""

import os
import sys
import zipfile
import shutil
from pathlib import Path
from PIL import Image

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore

ROOT = Path(__file__).resolve().parents[2]
DATASET_DIR = ROOT / "dataset"
DATASET_FINAL_DIR = ROOT / "ai" / "dataset_final"

def extract_archive_1_sequential(zip_file: Path, target_dir: Path, max_files=800):
    """Handles archive (1).zip which had a truncated central directory but has valid local headers."""
    import struct, zlib
    target_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    with open(zip_file, "rb") as f:
        while True:
            sig = f.read(4)
            if sig != b"PK\x03\x04":
                break
            header = f.read(26)
            if len(header) < 26:
                break
            (_, _, comp_method, _, _, _, comp_size, uncomp_size, name_len, extra_len) = struct.unpack(
                "<HHHHHIIIHH", header
            )
            name = f.read(name_len).decode("utf-8", errors="ignore")
            extra = f.read(extra_len)
            comp_data = f.read(comp_size)

            lower_name = name.lower()
            if any(lower_name.endswith(ext) for ext in (".jpg", ".jpeg", ".png")) and comp_size > 0:
                try:
                    if comp_method == 8:  # Deflated
                        data = zlib.decompress(comp_data, -15)
                    elif comp_method == 0:  # Stored
                        data = comp_data
                    else:
                        continue

                    base_name = Path(name).name
                    out_path = target_dir / f"garbage_{count:05d}_{base_name}"
                    out_path.write_bytes(data)
                    count += 1
                    if count >= max_files:
                        break
                except Exception:
                    continue
    return count

def main():
    print(f"Creating datasets in: {DATASET_DIR}")
    DATASET_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Garbage from archive (1).zip
    garbage_dir = DATASET_DIR / "Garbage"
    archive_1 = ROOT / "archive (1).zip"
    if archive_1.exists():
        print("Extracting Garbage from archive (1).zip...")
        g_count = extract_archive_1_sequential(archive_1, garbage_dir, max_files=800)
        print(f"Extracted {g_count} Garbage images.")

    # 2. Pothole & Normal Road from archive (2).zip
    archive_2 = ROOT / "archive (2).zip"
    pothole_dir = DATASET_DIR / "Pothole"
    normal_dir = DATASET_DIR / "Normal_Road"
    pothole_dir.mkdir(parents=True, exist_ok=True)
    normal_dir.mkdir(parents=True, exist_ok=True)
    if archive_2.exists():
        print("Extracting Pothole and Normal Road from archive (2).zip...")
        with zipfile.ZipFile(archive_2, "r") as zf:
            p_count = 0
            n_count = 0
            for member in zf.infolist():
                if member.is_dir():
                    continue
                lower = member.filename.lower()
                if "pothole" in lower and any(lower.endswith(ext) for ext in (".jpg", ".jpeg", ".png")):
                    base_name = Path(member.filename).name
                    out_path = pothole_dir / f"pothole_{p_count:05d}_{base_name}"
                    with zf.open(member) as src, open(out_path, "wb") as dst:
                        shutil.copyfileobj(src, dst)
                    p_count += 1
                elif "normal" in lower and any(lower.endswith(ext) for ext in (".jpg", ".jpeg", ".png")):
                    base_name = Path(member.filename).name
                    out_path = normal_dir / f"normal_{n_count:05d}_{base_name}"
                    with zf.open(member) as src, open(out_path, "wb") as dst:
                        shutil.copyfileobj(src, dst)
                    n_count += 1
        print(f"Extracted {p_count} Potholes and {n_count} Normal Road images.")

    # 3. Drainage from archive.zip and archive/
    drainage_dir = DATASET_DIR / "Drainage"
    drainage_dir.mkdir(parents=True, exist_ok=True)
    orig_archive_dir = ROOT / "archive" / "Images(original)-20250212T095824Z-001" / "Images(original)"
    if orig_archive_dir.exists():
        print("Copying Drainage images from archive/Images(original)...")
        d_count = 0
        for f in orig_archive_dir.glob("*.png"):
            shutil.copy2(f, drainage_dir / f"drainage_{f.name}")
            d_count += 1
        print(f"Extracted {d_count} Drainage images.")

    # 4. Water Leakage
    water_dir = DATASET_DIR / "Water_Leakage"
    water_dir.mkdir(parents=True, exist_ok=True)

    # 5. Human / Negative class
    human_dir = DATASET_DIR / "Human"
    human_dir.mkdir(parents=True, exist_ok=True)

    print("\nDataset preparation summary:")
    for sub in DATASET_DIR.iterdir():
        if sub.is_dir():
            files = list(sub.glob("*.*"))
            print(f"  - {sub.name}: {len(files)} files")

if __name__ == "__main__":
    main()
