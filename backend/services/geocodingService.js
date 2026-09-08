const { AI_SUPPORTED_CATEGORIES } = require("../constants/issueCategories");

/**
 * Deterministic, offline fallback address built directly from the GPS
 * coordinates that were actually extracted from the report (EXIF or
 * browser geolocation). Used only when the external reverse-geocoding
 * provider is unavailable or fails, so the stored address always reflects
 * the real coordinates instead of a stale/incorrect place name and issue
 * creation is never blocked by a third-party outage.
 */
function buildCoordinateFallbackAddress(latitude, longitude) {
  if (latitude === null || longitude === null || latitude === undefined || longitude === undefined) {
    return null;
  }

  const latText = Number(latitude).toFixed(6);
  const lonText = Number(longitude).toFixed(6);

  return `Approximate location (${latText}, ${lonText}) - address lookup unavailable`;
}

const addressCache = new Map();
let googleMapsDisabled = false;

function clearAddressCache() {
  addressCache.clear();
  googleMapsDisabled = false;
}

async function reverseGeocode(latitude, longitude) {
  if (latitude === null || longitude === null || latitude === undefined || longitude === undefined) {
    return null;
  }

  const cacheKey = `${Number(latitude).toFixed(5)}_${Number(longitude).toFixed(5)}`;
  if (addressCache.has(cacheKey)) {
    return addressCache.get(cacheKey);
  }

  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!googleMapsDisabled && googleApiKey && googleApiKey.trim()) {
    try {
      const gUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(latitude)},${encodeURIComponent(longitude)}&key=${encodeURIComponent(googleApiKey.trim())}`;
      const gResponse = await fetch(gUrl, {
        signal: AbortSignal.timeout(800),
        headers: { "User-Agent": "AI-Urban-Smart-City-Monitoring-System/1.0" },
      });
      if (gResponse.ok) {
        const gData = await gResponse.json();
        if (gData.status === "OK" && gData.results && gData.results.length > 0) {
          const addr = gData.results[0].formatted_address || null;
          if (addr) {
            addressCache.set(cacheKey, addr);
            return addr;
          }
        } else if (gData.status === "REQUEST_DENIED" || gData.status === "OVER_QUERY_LIMIT") {
          googleMapsDisabled = true;
        }
      }
    } catch (_) {
      googleMapsDisabled = true;
    }
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&zoom=18&addressdetails=1`,
      {
        headers: {
          "User-Agent": "AI-Urban-Smart-City-Monitoring-System/1.0",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Geocoding request failed with status ${response.status}`);
    }

    const data = await response.json();
    const addr = data?.display_name || null;
    if (addr) {
      addressCache.set(cacheKey, addr);
      return addr;
    }
    return null;
  } catch (error) {
    console.error("Reverse geocode error:", error);
    return null;
  }
}

function normalizeCategory(category) {
  if (!category || typeof category !== "string") {
    throw new Error("AI prediction category is required");
  }

  const normalizedCategory = category.trim();

  if (normalizedCategory === "Water_Leakage") {
    return "Water Leakage";
  }

  // The trained AI model (ai/model/urban_issue_classifier.keras) can only
  // predict AI_SUPPORTED_CATEGORIES. This validation intentionally stays
  // scoped to those categories so we never silently accept - or fabricate -
  // a prediction the model was never trained to make.
  if (!AI_SUPPORTED_CATEGORIES.includes(normalizedCategory)) {
    throw new Error(`Unsupported AI category: ${normalizedCategory}`);
  }

  return normalizedCategory;
}

function generateTitle(category) {
  switch (normalizeCategory(category)) {
    case "Pothole":
      return "Detected Pothole";

    case "Road Damage":
      return "Detected Road Damage";

    case "Garbage":
      return "Detected Garbage";

    case "Illegal Dumping":
      return "Detected Illegal Dumping";

    case "Drainage":
      return "Detected Drainage";

    case "Water Leakage":
      return "Detected Water Leakage";

    case "Street Light":
      return "Detected Street Light Issue";

    case "Traffic Signal":
      return "Detected Traffic Signal Issue";

    default:
      return "Detected Civic Issue";
  }
}

function generateDescription(category, address) {
  const normalizedCategory = normalizeCategory(category);
  const addressText = address && address !== "Address unavailable" ? address : "the reported location";

  switch (normalizedCategory) {
    case "Pothole":
      return `A pothole issue was detected at ${addressText}.`;
    case "Road Damage":
      return `Road damage was detected at ${addressText}.`;
    case "Garbage":
      return `Garbage accumulation was detected at ${addressText}.`;
    case "Illegal Dumping":
      return `Illegal dumping was detected at ${addressText}.`;
    case "Drainage":
      return `A drainage issue was detected at ${addressText}.`;
    case "Water Leakage":
      return `A water leakage issue was detected at ${addressText}.`;
    case "Street Light":
      return `A street light issue was detected at ${addressText}.`;
    case "Traffic Signal":
      return `A traffic signal issue was detected at ${addressText}.`;
    default:
      return `An urban issue was detected at ${addressText}.`;
  }
}

module.exports = {
  reverseGeocode,
  buildCoordinateFallbackAddress,
  normalizeCategory,
  generateTitle,
  generateDescription,
  clearAddressCache,
};
