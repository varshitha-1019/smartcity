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
            crop = im.crop((0, 0, w, int(h * 0.30)))
        elif mode == "stamp_box":
            # Right-side card where GPS Map Camera places the translucent box
            crop = im.crop((int(w * 0.25), int(h * 0.15), w, int(h * 0.95)))
        else:
            # Bottom 60% of image covering all standard stamp positions
            crop = im.crop((0, int(h * 0.40), w, h))
        
        target_w = 1100
        if crop.width < target_w:
            scale = min(3.0, target_w / crop.width)
            crop = crop.resize((int(crop.width * scale), int(crop.height * scale)), Image.Resampling.BILINEAR)
        elif crop.width > 1600:
            scale = 1600 / crop.width
            crop = crop.resize((int(crop.width * scale), int(crop.height * scale)), Image.Resampling.BILINEAR)

        # Convert to grayscale with contrast enhancement for crisp character recognition
        gray = crop.convert("L")
        enhancer = ImageEnhance.Contrast(gray)
        enhanced = enhancer.enhance(1.8)
        enhanced.save(dst)
        sys.exit(0)
except Exception:
    sys.exit(1)
