"""Run predict.py on folders arranged as test/<ExpectedClass>/*.jpg."""
from pathlib import Path
import argparse, json, subprocess, sys
from collections import Counter

ROOT = Path(__file__).resolve().parents[2]
PREDICT = ROOT / "ai" / "scripts" / "predict.py"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("test_root", type=Path)
    args = ap.parse_args()
    total = correct = unknown = 0
    conf = Counter()
    for class_dir in sorted(p for p in args.test_root.iterdir() if p.is_dir()):
        expected = class_dir.name
        for img in class_dir.iterdir():
            if img.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}: continue
            proc = subprocess.run([sys.executable, str(PREDICT), str(img)], capture_output=True, text=True)
            try: result = json.loads(proc.stdout.strip())
            except Exception: continue
            total += 1
            pred = result.get("category", "Unknown")
            conf[(expected, pred)] += 1
            if pred == expected: correct += 1
            if pred == "Unknown": unknown += 1
    print(f"Total={total} Correct={correct} Unknown={unknown} Auto-route accuracy={(correct/total if total else 0):.3f}")
    for (exp, pred), n in sorted(conf.items()): print(f"{exp:14s} -> {pred:14s}: {n}")

if __name__ == "__main__": main()
