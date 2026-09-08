"""Image preparation shared by the civic-issue classifier."""

import numpy as np
from PIL import Image


TARGET_SIZE = (224, 224)
MIN_IMAGE_DIMENSION = 160
MIN_OVERLAY_RATIO = 0.08
MAX_OVERLAY_RATIO = 0.30

# How much flatter / less colorful the candidate banner band must be than
# the rest of the frame before we trust it's really an overlay and not
# just photo content (e.g. a drainage channel, wet asphalt, foliage)
# reaching the bottom edge.
BANNER_TEXTURE_RATIO = 0.75
BANNER_SATURATION_RATIO = 0.75


def has_gps_banner(img: Image.Image, overlay_ratio: float) -> bool:
	"""Detect whether the bottom ``overlay_ratio`` strip of ``img`` looks
	like a flat GPS-camera-app banner rather than real photo content.

	GPS-stamp overlays ("GPS Map Camera"-style apps) are drawn as a flat,
	low-saturation background rectangle behind the timestamp/coordinates
	text, so that band is visually flatter (lower row-to-row texture) and
	less colorful (lower saturation) than the photographed scene above it.
	Real scene content that happens to extend to the bottom of the frame
	(water, drains, road surface, vegetation) is usually just as textured
	and colorful as the rest of the photo, so this comparison is what lets
	us tell the two apart instead of assuming every photo has a banner.
	"""
	width, height = img.size
	split = int(height * (1 - overlay_ratio))
	if split <= 0 or split >= height:
		return False

	arr = np.asarray(img).astype(np.float32)
	band = arr[split:, :, :]
	rest = arr[:split, :, :]
	if band.size == 0 or rest.size == 0:
		return False

	band_texture = float(band.mean(axis=2).std(axis=1).mean())
	rest_texture = float(rest.mean(axis=2).std(axis=1).mean())
	band_saturation = float((band.max(axis=2) - band.min(axis=2)).mean())
	rest_saturation = float((rest.max(axis=2) - rest.min(axis=2)).mean())

	flatter = band_texture <= rest_texture * BANNER_TEXTURE_RATIO
	less_colorful = band_saturation <= rest_saturation * BANNER_SATURATION_RATIO
	return flatter and less_colorful


def crop_central_issue_area(img: Image.Image) -> Image.Image:
	"""Crop image to focus on the civic issue area, removing GPS camera stamps
	(typically located in bottom 25-30%) and distant horizon/sky/background.
	"""
	width, height = img.size
	if min(width, height) < MIN_IMAGE_DIMENSION:
		return img.copy()

	if height > width:
		left = int(width * 0.02)
		top = int(height * 0.02)
		right = int(width * 0.98)
		bottom = int(height * 0.80)
	else:
		left = int(width * 0.02)
		top = int(height * 0.02)
		right = int(width * 0.98)
		bottom = int(height * 0.85)

	if bottom <= top or (right - left) * (bottom - top) < width * height * 0.40:
		return img.copy()
	return img.crop((left, top, right, bottom))


def load_for_classification(image_path: str) -> Image.Image:
	"""Load, crop (only if a banner is detected) and resize an upload for
	model inference. Scaling to 224x224 RGB happens here; the caller is
	still responsible for calling
	``tf.keras.applications.mobilenet_v2.preprocess_input`` on the
	resulting array before feeding it to the model, so there is exactly
	one place in the codebase that does MobileNetV2-specific scaling.
	"""
	with Image.open(image_path) as source:
		cropped = crop_central_issue_area(source.convert("RGB"))
		return cropped.resize(TARGET_SIZE, Image.Resampling.LANCZOS)
