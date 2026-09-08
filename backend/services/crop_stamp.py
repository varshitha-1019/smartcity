import sys
from PIL import Image, ImageEnhance

if len(sys.argv) < 3:
    sys.exit(1)

src = sys.argv[1]
dst = sys.argv[2]
mode = sys.argv[3] if len(sys.argv) > 3 else "bottom"

try:
    with Image.open(src) as im:
        w, h = im.size
        if mode == "top":
            crop = im.crop((0, 0, w, int(h * 0.22)))
        else:
            # Lower section where 99% of GPS Map Camera / Solocator stamps are placed
            crop = im.crop((0, int(h * 0.58), w, int(h * 0.98)))
        
        target_w = 900
        if crop.width < target_w:
            scale = min(2.2, target_w / crop.width)
            crop = crop.resize((int(crop.width * scale), int(crop.height * scale)), Image.Resampling.BILINEAR)
        elif crop.width > 1200:
            scale = 1200 / crop.width
            crop = crop.resize((int(crop.width * scale), int(crop.height * scale)), Image.Resampling.BILINEAR)

        # Convert to high-contrast grayscale for ultra-fast character recognition
        gray = crop.convert("L")
        enhancer = ImageEnhance.Contrast(gray)
        enhanced = enhancer.enhance(2.0)
        enhanced.save(dst)
        sys.exit(0)
except Exception:
    sys.exit(1)
