const fs = require("fs");
const path = require("path");
const exifr = require("exifr");
const Tesseract = require("tesseract.js");
const { spawn } = require("child_process");

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function rationalToNumber(value) {
  if (
    value &&
    typeof value === "object" &&
    typeof value.numerator === "number" &&
    typeof value.denominator === "number" &&
    value.denominator !== 0
  ) {
    return value.numerator / value.denominator;
  }

  return toNumber(value);
}

function normalizeCoordinate(value) {
  const numeric = rationalToNumber(value);

  if (numeric !== null) {
    return Number(numeric.toFixed(6));
  }

  if (Array.isArray(value) && value.length === 3) {
    const degrees = rationalToNumber(value[0]);
    const minutes = rationalToNumber(value[1]);
    const seconds = rationalToNumber(value[2]);

    if (
      degrees !== null &&
      minutes !== null &&
      seconds !== null
    ) {
      const decimal =
        degrees +
        minutes / 60 +
        seconds / 3600;

      return Number(decimal.toFixed(6));
    }
  }

  return null;
}

function applyRef(value, ref) {
  if (value === null || value === undefined) {
    return null;
  }

  if (ref === "S" || ref === "W") {
    return -Math.abs(value);
  }

  if (ref === "N" || ref === "E") {
    return Math.abs(value);
  }

  return value;
}

function isValidGpsCoordinates(latitude, longitude) {
  return (
    latitude !== null &&
    longitude !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function parseBrowserGps(body = {}) {
  const latitude = toNumber(body.latitude);
  const longitude = toNumber(body.longitude);

  if (latitude === null || longitude === null) {
    return {
      hasGps: false,
    };
  }

  if (!isValidGpsCoordinates(latitude, longitude)) {
    return {
      hasGps: false,
      message:
        "Invalid GPS coordinates provided. Latitude must be between -90 and 90, longitude between -180 and 180.",
    };
  }

  const accuracy = toNumber(body.accuracy);

  let captureTimestamp = null;

  if (body.captureTimestamp) {
    const parsed = new Date(body.captureTimestamp);

    if (!Number.isNaN(parsed.getTime())) {
      captureTimestamp = parsed;
    }
  }

  return {
    hasGps: true,
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
    accuracy,
    captureTimestamp,
    source: "browser",
  };
}

const exifCache = new Map();

async function extractGpsMetadata(imagePath) {
  if (!imagePath) {
    return {
      latitude: null,
      longitude: null,
      hasGps: false,
      message:
        "The uploaded image does not contain valid GPS metadata. Please upload a geo-tagged image.",
    };
  }

  const fingerprint = getFileFingerprint(imagePath);
  if (exifCache.has(fingerprint)) {
    return { ...exifCache.get(fingerprint) };
  }

  try {
    const exif = await exifr.parse(imagePath, {
      gps: true,
    });

    const gps = exif?.gps || exif || {};

    const latitudeValue = normalizeCoordinate(
      gps.Latitude ??
        gps.latitude ??
        exif?.GPSLatitude ??
        exif?.latitude
    );

    const longitudeValue = normalizeCoordinate(
      gps.Longitude ??
        gps.longitude ??
        exif?.GPSLongitude ??
        exif?.longitude
    );

    const latitudeRef =
      gps.LatitudeRef ??
      gps.latitudeRef ??
      exif?.GPSLatitudeRef;

    const longitudeRef =
      gps.LongitudeRef ??
      gps.longitudeRef ??
      exif?.GPSLongitudeRef;

    const latitude = applyRef(latitudeValue, latitudeRef);

    const longitude = applyRef(longitudeValue, longitudeRef);

    let res;
    if (isValidGpsCoordinates(latitude, longitude)) {
      res = {
        hasGps: true,
        latitude,
        longitude,
        accuracy: null,
        captureTimestamp: null,
        source: "exif",
      };
    } else {
      res = {
        hasGps: false,
        latitude: null,
        longitude: null,
        message:
          "The uploaded image does not contain valid GPS metadata. Please upload a geo-tagged image.",
      };
    }
    exifCache.set(fingerprint, res);
    return res;
  } catch (error) {
    console.error("GPS metadata extraction failed:", error);
    const failRes = {
      hasGps: false,
      latitude: null,
      longitude: null,
      message:
        "The uploaded image does not contain valid GPS metadata. Please upload a geo-tagged image.",
    };
    exifCache.set(fingerprint, failRes);
    return failRes;
  }
}

// Matches the "Lat 16.233144° Long 80.546237°" style label pairs that
// GPS-Map-Camera-style apps burn into the photo itself, optionally with an
// N/S/E/W hemisphere suffix instead of (or alongside) a leading sign.
// Requiring the explicit "Lat"/"Long" labels (rather than any bare pair of
// decimal numbers) is deliberate: it's exactly the format real GPS-camera
// stamps use, and it's specific enough that it will never accidentally
// match this app's own in-app camera-capture overlay (drawGeoTagOverlay,
// see frontend/src/utils/geoTag.js), which renders coordinates as
// "16.2331° N, 80.5462° E" with no "Lat"/"Long" word at all. That keeps
// fresh in-app camera captures on their existing (already-precise) browser
// GPS instead of being silently downgraded to a lower-precision OCR read
// of their own overlay text.
const LAT_DIR_PATTERN = /(-?\d{1,3}(?:[.,\s]\d{3,8}))\s*(?:°|deg|d)?\s*([NS])\s*[,;\s]*(-?\d{1,3}(?:[.,\s]\d{3,8}))\s*(?:°|deg|d)?\s*([EW])/i;
const LAT_STAMP_PATTERN = /Lat(?:itude)?\W{0,3}(-?\d{1,3}(?:[.,\s]\d{3,8}))\s*(?:°|deg)?\s*([NS])?/i;
const LONG_STAMP_PATTERN = /Long(?:itude)?\W{0,3}(-?\d{1,3}(?:[.,\s]\d{3,8}))\s*(?:°|deg)?\s*([EW])?/i;
const LAT_LONG_PAIR_PATTERN = /Lat(?:itude)?\D*?(-?\d{1,2}(?:[.,]\d{3,8})|\d{7,9})\D+?Long(?:itude)?\D*?(-?\d{1,3}(?:[.,]\d{3,8})|\d{7,9})/i;
const PLAIN_COORD_PATTERN = /(-?\d{1,2}[.,]\d{3,8})\s*,\s*(-?\d{1,3}[.,]\d{3,8})/;
const ACCURACY_PATTERN = /Accuracy\D*(\d+(?:[.,]\d+)?)\s*m/i;

function parseCoordinateNumber(raw, hemisphere) {
  if (!raw) return null;
  let cleaned = raw.trim().replace(/\s+/, ".").replace(",", ".");
  if (!cleaned.includes(".")) {
    if (cleaned.length >= 7 && cleaned.length <= 9) {
      cleaned = cleaned.slice(0, 2) + "." + cleaned.slice(2);
    }
  }
  let num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  if (hemisphere === "S" || hemisphere === "W") num = -Math.abs(num);
  if (hemisphere === "N" || hemisphere === "E") num = Math.abs(num);
  return num;
}

function applyHemisphere(value, hemisphere) {
  if (value === null || value === undefined) return null;
  if (hemisphere === "S" || hemisphere === "W") return -Math.abs(value);
  if (hemisphere === "N" || hemisphere === "E") return Math.abs(value);
  return value;
}

function isDateTimeOrNoise(line) {
  if (!line || typeof line !== "string") return true;
  if (/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun/i.test(line)) return true;
  if (/GMT|UTC|\bAM\b|\bPM\b/i.test(line)) return true;
  if (/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(line)) return true;
  if (/\b\d{1,2}:\d{2}\b/.test(line)) return true;
  if (/\b\d{1,3}\s*(?:°\s*[CcFf]?|00g[CcFf]|deg[CcFf]?)\b/i.test(line)) return true;
  if (/Lat|Long|Accuracy|Google|Go\s*le|Compass/i.test(line)) return true;
  return false;
}

function scorePlaceLine(line) {
  if (!line) return -100;
  if (isDateTimeOrNoise(line)) return -100;
  const clean = line.replace(/^[📍•*|\-\s]+/, "").trim();
  if (clean.length < 5) return -50;
  if (/^id\s+pr/i.test(clean)) return -30;
  if (LAT_DIR_PATTERN.test(clean) || (LAT_STAMP_PATTERN.test(clean) && LONG_STAMP_PATTERN.test(clean)) || PLAIN_COORD_PATTERN.test(clean)) return -100;
  if (ACCURACY_PATTERN.test(clean)) return -100;

  let score = 0;
  if (/Andhra|Pradesh|India|Guntur|Vadlamudi|Tenali|Road|Street|Nagar|Village|Mandal|District/i.test(clean)) score += 30;
  if (/\b\d{6}\b/.test(clean)) score += 15;
  if (clean.includes(",")) score += 5;
  const words = clean.split(/\s+/).filter((w) => w.length >= 3 && /^[A-Za-z0-9]/.test(w));
  score += words.length * 2;
  return score;
}

function cleanPlaceLine(line) {
  if (!line) return null;
  return line
    .replace(/^[📍•*|\-\s]+/, "")
    .replace(/[§&|<>*•~`^¥()=;'"[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatCleanAddress(raw) {
  if (!raw) return null;
  if (isDateTimeOrNoise(raw)) return null;

  const clean = raw.replace(/[§&|<>*•~`^¥()=;'"[\]]/g, " ").replace(/\s+/g, " ").trim();
  const withoutPlusCode = clean.replace(/^.*?\b[a-zA-Z0-9]{4,8}\+[a-zA-Z0-9]{2,4},?\s*/i, "").trim();
  const target = withoutPlusCode.length >= 8 ? withoutPlusCode : clean;

  const stateRegex = /([A-Za-z][A-Za-z\s]+,\s*(?:Andhra\s+Pradesh|Telangana|Karnataka|Tamil\s+Nadu|Maharashtra|Kerala|Delhi|Gujarat|Rajasthan|Punjab|Haryana|Uttar\s+Pradesh|Madhya\s+Pradesh|West\s+Bengal|Odisha|Bihar|Assam)(?:\s+\d{6})?(?:,\s*India)?)/i;
  const stateMatch = target.match(stateRegex);
  if (stateMatch) {
    let res = stateMatch[1].trim();
    res = res.replace(/^[a-z0-9\s]{1,3}\b/i, "").trim();
    if (!res.toLowerCase().includes("india")) {
      res = res.replace(/,\s*$/, "") + ", India";
    }
    return res;
  }

  const indiaRegex = /([A-Za-z][A-Za-z\s]+,\s*[A-Za-z\s]+(?:\s+\d{6})?,\s*India)/i;
  const indiaMatch = target.match(indiaRegex);
  if (indiaMatch) {
    return indiaMatch[1].trim();
  }

  let cleaned = target.replace(/,\s*[A-Z]{1,2}$/, "");
  if (cleaned.length >= 8 && cleaned.includes(",")) {
    return cleaned.trim();
  }
  return null;
}

function guessStampAddress(lines, coordLineIndex) {
  const candidates = lines
    .map((l, i) => {
      const formatted = formatCleanAddress(l);
      return {
        raw: l,
        formatted,
        score: scorePlaceLine(l),
        dist: coordLineIndex >= 0 ? Math.abs(i - coordLineIndex) : i,
      };
    })
    .filter((c) => c.formatted && c.score > 0);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score || a.dist - b.dist);
  return candidates[0].formatted;
}

const stampOcrCache = new Map();
let tesseractWorkerPromise = null;

function resolvePythonExecutable() {
  const explicit = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE;
  if (explicit) return explicit;
  const projectRoot = path.resolve(__dirname, "..", "..");
  const candidates = process.platform === "win32"
    ? [
        path.join(projectRoot, ".venv", "Scripts", "python.exe"),
        path.join(projectRoot, "ai", "venv", "Scripts", "python.exe"),
      ]
    : [
        path.join(projectRoot, ".venv", "bin", "python"),
        path.join(projectRoot, "ai", "venv", "bin", "python"),
        path.join(projectRoot, ".venv", "bin", "python3"),
        path.join(projectRoot, "ai", "venv", "bin", "python3"),
        "/usr/bin/python3",
        "/usr/local/bin/python3",
      ];
  return candidates.find(fs.existsSync) || (process.platform === "win32" ? "python" : "python3");
}

async function getTesseractWorker() {
  if (!tesseractWorkerPromise) {
    const trainedDataDir = path.resolve(__dirname, "..");
    tesseractWorkerPromise = Tesseract.createWorker("eng", 1, {
      cachePath: trainedDataDir,
    }).catch((err) => {
      tesseractWorkerPromise = null;
      throw err;
    });
  }
  return tesseractWorkerPromise;
}

async function stopTesseractWorker() {
  if (tesseractWorkerPromise) {
    try {
      const worker = await tesseractWorkerPromise;
      await worker.terminate();
    } catch (_) {}
    tesseractWorkerPromise = null;
  }
}

function getFileFingerprint(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(512);
    const bytesRead = fs.readSync(fd, buf, 0, 512, 0);
    fs.closeSync(fd);
    return `${stat.size}_${buf.slice(0, bytesRead).toString("hex")}`;
  } catch {
    return filePath;
  }
}

async function runTesseract(imagePath) {
  let combinedText = "";
  const cropScript = path.join(__dirname, "crop_stamp.py");
  const pythonExe = resolvePythonExecutable();

  // Helper to crop and OCR a specific section
  const tryCropSection = async (mode, timeoutMs = 5000) => {
    if (!fs.existsSync(cropScript)) return "";
    const tmpFile = path.join(__dirname, `tmp_${mode}_${Date.now()}_${Math.random().toString(36).slice(2)}.png`);
    try {
      const { execFileSync } = require("child_process");
      execFileSync(pythonExe, [cropScript, path.resolve(imagePath), tmpFile, mode], { timeout: timeoutMs });
      if (fs.existsSync(tmpFile)) {
        const worker = await getTesseractWorker();
        const { data } = await worker.recognize(tmpFile);
        try { fs.unlinkSync(tmpFile); } catch (_) {}
        return data?.text || "";
      }
    } catch (err) {
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (_) {}
    }
    return "";
  };

  // 1. Fast Path: Bottom 60% where standard GPS-Map-Camera / Solocator stamps live (~200-400ms)
  const bottomText = await tryCropSection("bottom", 5000);
  if (bottomText) {
    combinedText += bottomText + "\n";
    if (LAT_DIR_PATTERN.test(combinedText) || LAT_STAMP_PATTERN.test(combinedText) || LAT_LONG_PAIR_PATTERN.test(combinedText)) {
      return combinedText.trim();
    }
  }

  // 2. Secondary Path: Stamp box card (right side card layout)
  const boxText = await tryCropSection("stamp_box", 5000);
  if (boxText) {
    combinedText += boxText + "\n";
    if (LAT_DIR_PATTERN.test(combinedText) || LAT_STAMP_PATTERN.test(combinedText) || LAT_LONG_PAIR_PATTERN.test(combinedText)) {
      return combinedText.trim();
    }
  }

  // 3. Tertiary Path: Top banner
  const topText = await tryCropSection("top", 3000);
  if (topText) {
    combinedText += "\n" + topText;
    if (LAT_DIR_PATTERN.test(combinedText) || LAT_STAMP_PATTERN.test(combinedText) || LAT_LONG_PAIR_PATTERN.test(combinedText)) {
      return combinedText.trim();
    }
  }

  // 4. Reliable Fallback: Full original image OCR (guarantees no GPS stamp is ever missed)
  try {
    const worker = await getTesseractWorker();
    const { data } = await worker.recognize(path.resolve(imagePath));
    if (data?.text) {
      combinedText += "\n" + data.text;
    }
  } catch (fullErr) {
    console.warn("[gpsService] full image OCR notice:", fullErr?.message);
  }

  return combinedText.trim() || null;
}

// Priority 2: reads visible GPS camera stamps burned into the image's pixels via OCR
async function extractGpsFromImageStamp(imagePath) {
  const notFound = {
    hasGps: false,
    latitude: null,
    longitude: null,
    accuracy: null,
    captureTimestamp: null,
    address: null,
  };

  if (!imagePath) {
    return notFound;
  }

  const fingerprint = getFileFingerprint(imagePath);
  if (stampOcrCache.has(fingerprint)) {
    return { ...stampOcrCache.get(fingerprint) };
  }

  const text = await runTesseract(imagePath);
  if (!text) {
    stampOcrCache.set(fingerprint, notFound);
    return notFound;
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let latitude = null;
  let longitude = null;
  let coordLineIndex = -1;
  let accuracy = null;

  // Extract accuracy if visible (e.g. Accuracy: 50000m)
  for (const line of lines) {
    const accMatch = ACCURACY_PATTERN.exec(line);
    if (accMatch) {
      const val = Number(accMatch[1]);
      if (Number.isFinite(val)) {
        accuracy = val;
      }
    }
  }

  // Strategy 1: Check for combined "16.3410° N, 80.4892° E" or "16.3410 deg N 80 4892 deg E"
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const pairMatch = LAT_DIR_PATTERN.exec(line);
    if (pairMatch) {
      const lat = parseCoordinateNumber(pairMatch[1], pairMatch[2]?.toUpperCase());
      const lon = parseCoordinateNumber(pairMatch[3], pairMatch[4]?.toUpperCase());
      if (isValidGpsCoordinates(lat, lon)) {
        latitude = lat;
        longitude = lon;
        coordLineIndex = i;
        break;
      }
    }
  }

  // Strategy 1.5: Direct Lat ... Long ... pair matching on individual lines
  if (latitude === null) {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const pairMatch = LAT_LONG_PAIR_PATTERN.exec(line);
      if (pairMatch) {
        const latVal = parseCoordinateNumber(pairMatch[1]);
        const lonVal = parseCoordinateNumber(pairMatch[2]);
        if (isValidGpsCoordinates(latVal, lonVal)) {
          latitude = latVal;
          longitude = lonVal;
          coordLineIndex = i;
          break;
        }
      }
    }
  }

  // Strategy 2: Check for explicit "Lat ... Long ..." on the same line
  if (latitude === null) {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const lat = LAT_STAMP_PATTERN.exec(line);
      const lon = LONG_STAMP_PATTERN.exec(line);
      if (lat && lon) {
        const latVal = parseCoordinateNumber(lat[1], lat[2]?.toUpperCase());
        const lonVal = parseCoordinateNumber(lon[1], lon[2]?.toUpperCase());
        if (isValidGpsCoordinates(latVal, lonVal)) {
          latitude = latVal;
          longitude = lonVal;
          coordLineIndex = i;
          break;
        }
      }
    }
  }

  // Strategy 3: Across joined text if wrapped
  if (latitude === null) {
    const joined = lines.join(" ");
    const pairMatch = LAT_DIR_PATTERN.exec(joined);
    if (pairMatch) {
      const lat = parseCoordinateNumber(pairMatch[1], pairMatch[2]?.toUpperCase());
      const lon = parseCoordinateNumber(pairMatch[3], pairMatch[4]?.toUpperCase());
      if (isValidGpsCoordinates(lat, lon)) {
        latitude = lat;
        longitude = lon;
        coordLineIndex = 0;
      }
    } else {
      const pairMatch2 = LAT_LONG_PAIR_PATTERN.exec(joined);
      if (pairMatch2) {
        const latVal = parseCoordinateNumber(pairMatch2[1]);
        const lonVal = parseCoordinateNumber(pairMatch2[2]);
        if (isValidGpsCoordinates(latVal, lonVal)) {
          latitude = latVal;
          longitude = lonVal;
          coordLineIndex = 0;
        }
      } else {
        const lat = LAT_STAMP_PATTERN.exec(joined);
        const lon = LONG_STAMP_PATTERN.exec(joined);
        if (lat && lon) {
          const latVal = parseCoordinateNumber(lat[1], lat[2]?.toUpperCase());
          const lonVal = parseCoordinateNumber(lon[1], lon[2]?.toUpperCase());
          if (isValidGpsCoordinates(latVal, lonVal)) {
            latitude = latVal;
            longitude = lonVal;
            coordLineIndex = 0;
          }
        }
      }
    }
  }

  // Strategy 4: Plain decimal pair "16.341000, 80.489200"
  if (latitude === null) {
    for (let i = 0; i < lines.length; i += 1) {
      const plainMatch = PLAIN_COORD_PATTERN.exec(lines[i]);
      if (plainMatch) {
        const lat = Number(plainMatch[1]);
        const lon = Number(plainMatch[2]);
        if (isValidGpsCoordinates(lat, lon)) {
          latitude = lat;
          longitude = lon;
          coordLineIndex = i;
          break;
        }
      }
    }
  }

  if (latitude === null || longitude === null || !isValidGpsCoordinates(latitude, longitude)) {
    stampOcrCache.set(fingerprint, notFound);
    return notFound;
  }

  const guessedAddress = guessStampAddress(lines, coordLineIndex);

  const result = {
    hasGps: true,
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
    accuracy,
    captureTimestamp: null,
    address: guessedAddress,
    source: "ocr-stamp",
  };
  stampOcrCache.set(fingerprint, result);
  return result;
}

async function resolveGpsLocation(body = {}, imagePath) {
  /*
      In-app camera captures or manual submissions carry authentic device/manual GPS
      and never contain third-party burned-in camera stamps. Handle them immediately in 0ms.
  */
  if (body.source === "camera" || body.source === "manual" || body.isManual) {
    const directGps = parseBrowserGps(body);
    if (directGps.hasGps) {
      return {
        ...directGps,
        source: body.source || (body.isManual ? "manual" : "camera"),
      };
    }
  }

  /*
      Priority 1: EXIF GPS embedded in the uploaded image file itself.
  */
  const exifGps = await extractGpsMetadata(imagePath);
  if (exifGps.hasGps) {
    return exifGps;
  }

  /*
      Priority 2: Visible GPS-Map-Camera stamp burned into the image pixels (OCR).
  */
  const stampGps = await extractGpsFromImageStamp(imagePath);
  if (stampGps.hasGps) {
    return stampGps;
  }

  /*
      Priority 3: Caller / Manual / Browser GPS.
      Used when the image has no usable EXIF GPS and no readable GPS stamp,
      and coordinates were provided in the request body.
  */
  const browserGps = parseBrowserGps(body);
  if (browserGps.hasGps) {
    return {
      ...browserGps,
      source: body.source === "manual" || body.isManual ? "manual" : "browser",
    };
  }

  /*
      If an uploaded image has no EXIF GPS and no visible GPS stamp,
      return hasGps: false. Do not fabricate or substitute a fake/browser location.
  */
  return {
    hasGps: false,
    latitude: null,
    longitude: null,
    accuracy: null,
    captureTimestamp: null,
    source: "none",
    message:
      "The uploaded image does not contain GPS metadata or a visible GPS stamp. Please provide the location manually.",
  };
}

// Maximum allowed distance (meters) between the citizen's original issue
// coordinates and the authority's resolution-evidence coordinates before
// the resolution location is flagged as unverified. Configurable via
// ALLOWED_RESOLUTION_RADIUS_METERS so deployments can tune it without a
// code change; defaults to 500m, which comfortably covers ordinary GPS/EXIF
// inaccuracy for a real-world civic issue site while still catching a
// resolution photo taken somewhere unrelated to the reported issue.
const DEFAULT_ALLOWED_RESOLUTION_RADIUS_METERS = 500;

function getAllowedResolutionRadiusMeters() {
  const configured = toNumber(process.env.ALLOWED_RESOLUTION_RADIUS_METERS);
  if (configured !== null && configured > 0) {
    return configured;
  }
  return DEFAULT_ALLOWED_RESOLUTION_RADIUS_METERS;
}

// Great-circle (haversine) distance between two lat/lon pairs, in meters.
// Used only to compare the citizen's original coordinates against the
// authority's resolution-evidence coordinates for the same issue - never to
// derive, adjust, or substitute either coordinate pair.
function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    return null;
  }

  const EARTH_RADIUS_METERS = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

// Compares the citizen's original (authentic, persisted) coordinates
// against the authority's resolution-evidence (authentic, persisted)
// coordinates and reports whether the resolution photo was taken within
// ALLOWED_RESOLUTION_RADIUS_METERS of the original issue. This never
// mutates or substitutes either coordinate pair - both remain exactly as
// resolved by resolveGpsLocation; this only adds an informational
// verified/warning flag alongside them.
function verifyResolutionLocation(originalLocation, resolutionLocation) {
  const radius = getAllowedResolutionRadiusMeters();

  const origLat = originalLocation?.latitude;
  const origLon = originalLocation?.longitude;
  const resLat = resolutionLocation?.latitude;
  const resLon = resolutionLocation?.longitude;

  if (
    !isValidGpsCoordinates(origLat, origLon) ||
    !isValidGpsCoordinates(resLat, resLon)
  ) {
    return {
      verified: null,
      distanceMeters: null,
      allowedRadiusMeters: radius,
      message: null,
    };
  }

  const distanceMeters = haversineDistanceMeters(origLat, origLon, resLat, resLon);
  const verified = distanceMeters !== null && distanceMeters <= radius;

  return {
    verified,
    distanceMeters: distanceMeters !== null ? Number(distanceMeters.toFixed(1)) : null,
    allowedRadiusMeters: radius,
    message: verified
      ? null
      : "Resolution photo location is outside the original issue location.",
  };
}

module.exports = {
  extractGpsMetadata,
  extractGpsFromImageStamp,
  parseBrowserGps,
  resolveGpsLocation,
  isValidGpsCoordinates,
  haversineDistanceMeters,
  verifyResolutionLocation,
  getAllowedResolutionRadiusMeters,
  getTesseractWorker,
  stopTesseractWorker,
};