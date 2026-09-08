// Shared geo-tagging helpers used by the Report Issue page: formatting the
// location text shown to the user, and drawing the same information as a
// professional-looking overlay burned onto a captured photo (like a
// dedicated GPS-camera app would).

export function formatCoordinate(value, positiveLabel, negativeLabel) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "--";
  }

  const label = value >= 0 ? positiveLabel : negativeLabel;
  return `${Math.abs(value).toFixed(4)}\u00B0 ${label}`;
}

export function formatDateTime(date) {
  const value = date instanceof Date ? date : new Date(date);

  if (Number.isNaN(value.getTime())) {
    return "";
  }

  const datePart = value.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const timePart = value.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return `${datePart} \u2022 ${timePart}`;
}

/**
 * Draws a semi-transparent geo-tag info panel across the bottom of a canvas
 * that already has the photo drawn onto it. The original photo pixels above
 * the panel are left untouched - only a strip at the bottom gets the
 * gradient + text, exactly like a geo-tagged camera app watermark.
 */
export function drawGeoTagOverlay(canvas, { address, latitude, longitude, accuracy, timestamp }) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  // Scale the panel/text relative to image size so it looks right on both
  // small and large captures.
  const baseFont = Math.max(14, Math.round(width / 42));
  const padding = Math.round(baseFont * 0.9);
  const lineHeight = Math.round(baseFont * 1.45);

  const addressLines = wrapText(ctx, address || "Address unavailable", width - padding * 2, `600 ${baseFont}px Arial`);
  const coordLine = `${formatCoordinate(latitude, "N", "S")}, ${formatCoordinate(longitude, "E", "W")}`;
  const metaLine = [
    accuracy !== null && accuracy !== undefined ? `Accuracy: ${Math.round(accuracy)}m` : null,
    timestamp ? formatDateTime(timestamp) : null,
  ]
    .filter(Boolean)
    .join("   |   ");

  const totalLines = addressLines.length + (coordLine ? 1 : 0) + (metaLine ? 1 : 0);
  const panelHeight = padding * 2 + totalLines * lineHeight;

  const gradient = ctx.createLinearGradient(0, height - panelHeight, 0, height);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(0.35, "rgba(0, 0, 0, 0.55)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.78)");

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, height - panelHeight, width, panelHeight);

  let cursorY = height - panelHeight + padding + baseFont * 0.85;

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 3;

  // First address line gets the location pin marker.
  ctx.font = `700 ${baseFont}px Arial`;
  addressLines.forEach((line, index) => {
    const text = index === 0 ? `\u{1F4CD} ${line}` : line;
    ctx.fillText(text, padding, cursorY);
    cursorY += lineHeight;
  });

  ctx.font = `500 ${Math.round(baseFont * 0.92)}px Arial`;
  if (coordLine) {
    ctx.fillText(coordLine, padding, cursorY);
    cursorY += lineHeight;
  }

  if (metaLine) {
    ctx.fillStyle = "#d1d5db";
    ctx.font = `400 ${Math.round(baseFont * 0.82)}px Arial`;
    ctx.fillText(metaLine, padding, cursorY);
  }

  ctx.restore();
}

function wrapText(ctx, text, maxWidth, font) {
  ctx.save();
  ctx.font = font;

  const words = text.split(" ");
  const lines = [];
  let current = "";

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });

  if (current) {
    lines.push(current);
  }

  ctx.restore();

  return lines.slice(0, 2).map((line, index, arr) =>
    index === 1 && arr.length === 2 && lines.length > 2 ? `${line.trim()}\u2026` : line
  );
}
