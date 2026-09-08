import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { createIssue, previewAddress, previewImageLocation, previewPrediction } from "../services/issueService";
import { drawGeoTagOverlay } from "../utils/geoTag";
import "./ReportIssue.css";

const GEO_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 5000,
  maximumAge: 30000,
};

const LOCATION_PERMISSION_MESSAGE =
  "Location access is required to automatically geo-tag this issue. You can continue without location or enable location permission.";

function getGeolocationErrorMessage(error) {
  if (error?.code === 1) {
    return LOCATION_PERMISSION_MESSAGE;
  }
  if (error?.code === 2) {
    return "Unable to determine your location. Please try again outdoors or with GPS enabled.";
  }
  if (error?.code === 3) {
    return "Location request timed out. Please try again.";
  }
  return error?.message || "Failed to get location.";
}

function getCurrentPosition() {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("Geolocation is not supported by your browser."));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(positionToLocationData(pos)),
      (err) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(positionToLocationData(pos)),
          (err2) => reject(err2 || err),
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
        );
      },
      GEO_OPTIONS
    );
  });
}

function positionToLocationData(position) {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    captureTimestamp: new Date(position.timestamp || Date.now()).toISOString(),
    source: "gps",
  };
}

function ReportIssue() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [image, setImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [issue, setIssue] = useState(null);
  const [locationData, setLocationData] = useState(null);
  // Camera captures have no embedded GPS of their own (the photo is drawn
  // fresh onto a canvas), so browser GPS is the real location there and is
  // always shown. Uploaded files may already carry their own EXIF GPS,
  // which the backend always prefers - so browser GPS collected during an
  // upload is only ever a fallback for images that turn out to have none,
  // and must not be presented as "the" location before that's known.
  const [imageSource, setImageSource] = useState(null);
  const [mode, setMode] = useState("idle");

  // For uploaded files only: the actual resolved location (EXIF GPS from
  // the file itself when present, browser GPS only as a fallback) as
  // determined by the same priority the backend enforces on submit - kept
  // separate from `locationData` (which for uploads holds the raw
  // browser/device reading used only as a fallback value to send) so the
  // preview shown to the citizen always matches what will really be stored,
  // never the raw device location.
  const [imageLocationPreview, setImageLocationPreview] = useState(null);
  const [imageLocationLoading, setImageLocationLoading] = useState(false);

  // Human-readable address resolved (best-effort) from whatever coordinates
  // are currently known, shown to the user before submission. Purely a
  // preview - the address actually stored on the issue is resolved
  // independently by the backend when the issue is created.
  const [address, setAddress] = useState("");
  const [addressLoading, setAddressLoading] = useState(false);

  // Shown when geolocation was denied/unavailable, so the citizen isn't
  // blocked from reporting - they can enter coordinates manually instead.
  const [locationDenied, setLocationDenied] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualLatitude, setManualLatitude] = useState("");
  const [manualLongitude, setManualLongitude] = useState("");
  const [manualError, setManualError] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [aiRejection, setAiRejection] = useState(null);
  const [instantPrediction, setInstantPrediction] = useState(null);
  const [predictingInstant, setPredictingInstant] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const activeLocationRef = useRef(null);
  const [locationLoading, setLocationLoading] = useState(true);

  const videoRef = useRef(null);
  const canvasRef = useRef(null); // raw captured frame, no overlay
  const overlayCanvasRef = useRef(null); // raw frame + geo-tag overlay burned in
  const streamRef = useRef(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [stopCamera, previewUrl]);

  useEffect(() => {
    if (mode === "camera" && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [mode]);

  const resetLocationUiState = () => {
    setAddress("");
    setAddressLoading(false);
    setLocationDenied(false);
    setShowManualEntry(false);
    setManualLatitude("");
    setManualLongitude("");
    setManualError("");
    setImageLocationPreview(null);
    setImageLocationLoading(false);
  };

  // Fetches a live address preview for the given coordinates (best-effort -
  // failures are silent, the raw coordinates are always still shown).
  const loadAddressPreview = useCallback(
    async (latitude, longitude) => {
      setAddressLoading(true);
      try {
        const resolved = await previewAddress(latitude, longitude, token);
        setAddress(resolved || "");
        return resolved || "";
      } finally {
        setAddressLoading(false);
      }
    },
    [token]
  );

  const fetchCurrentLocation = useCallback(async () => {
    setLocationLoading(true);
    try {
      const pos = await getCurrentPosition();
      const loc = {
        ...pos,
        source: "gps",
      };
      activeLocationRef.current = loc;
      setCurrentLocation(loc);
      setLocationData(loc);
      setLocationDenied(false);

      const resolved = await previewAddress(loc.latitude, loc.longitude, token);
      if (resolved) {
        setAddress(resolved);
        const updated = { ...loc, address: resolved };
        activeLocationRef.current = updated;
        setCurrentLocation(updated);
      } else {
        const coordFallback = `${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`;
        setAddress(coordFallback);
        const updated = { ...loc, address: coordFallback };
        activeLocationRef.current = updated;
        setCurrentLocation(updated);
      }
    } catch (err) {
      activeLocationRef.current = null;
      setCurrentLocation(null);
      setLocationData(null);
      setAddress("");
      setLocationDenied(true);
      setError(getGeolocationErrorMessage(err));
    } finally {
      setLocationLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let ignore = false;

    async function initLocation() {
      try {
        const pos = await getCurrentPosition();
        if (ignore) return;
        const loc = {
          ...pos,
          source: "gps",
        };
        activeLocationRef.current = loc;
        setCurrentLocation(loc);
        setLocationData(loc);
        setLocationDenied(false);

        const resolved = await previewAddress(loc.latitude, loc.longitude, token);
        if (ignore) return;
        const finalAddress = resolved || `${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`;
        setAddress(finalAddress);
        const updated = { ...loc, address: finalAddress };
        activeLocationRef.current = updated;
        setCurrentLocation(updated);
      } catch (err) {
        if (ignore) return;
        activeLocationRef.current = null;
        setCurrentLocation(null);
        setLocationData(null);
        setAddress("");
        setLocationDenied(true);
        setError(getGeolocationErrorMessage(err));
      } finally {
        if (!ignore) {
          setLocationLoading(false);
        }
      }
    }

    initLocation();
    return () => {
      ignore = true;
    };
  }, [token]);

  // Redraws the geo-tag overlay onto a fresh copy of the raw captured frame
  // and turns the result into the File that will actually be submitted.
  const renderOverlaidCameraImage = useCallback(async (loc, addressText) => {
    const rawCanvas = canvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!rawCanvas || !overlayCanvas || !rawCanvas.width) return null;

    overlayCanvas.width = rawCanvas.width;
    overlayCanvas.height = rawCanvas.height;
    const ctx = overlayCanvas.getContext("2d");
    ctx.drawImage(rawCanvas, 0, 0);

    const activeLoc = loc || activeLocationRef.current;
    if (activeLoc) {
      drawGeoTagOverlay(overlayCanvas, {
        address: addressText || activeLoc.address || `${activeLoc.latitude.toFixed(6)}, ${activeLoc.longitude.toFixed(6)}`,
        latitude: activeLoc.latitude,
        longitude: activeLoc.longitude,
        accuracy: activeLoc.accuracy,
        timestamp: activeLoc.captureTimestamp || new Date().toISOString(),
      });
    }

    const blob = await new Promise((resolve, reject) => {
      overlayCanvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("Failed to render captured image."))),
        "image/jpeg",
        0.95
      );
    });

    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(blob);
    });
    const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
    setImage(file);
    return file;
  }, []);

  const openCamera = async () => {
    setError("");
    setSuccess("");
    setIssue(null);
    setAiRejection(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      streamRef.current = stream;
      setMode("camera");
      fetchCurrentLocation();
    } catch {
      setError("Camera permission denied or unavailable. Please allow camera access.");
      setMode("idle");
    }
  };

  const handleInstantPrediction = async () => {
    if (instantPrediction) {
      if (instantPrediction.status === "VALID") {
        setSuccess(`AI Detected: ${instantPrediction.category} (${(instantPrediction.confidence * 100).toFixed(1)}% confidence) - Department: ${instantPrediction.assignedDepartment || instantPrediction.category}`);
      }
      return;
    }

    const target = image;
    if (!target) {
      setError("Please capture a photo or upload an image first.");
      return;
    }
    setPredictingInstant(true);
    setError("");
    setSuccess("");
    setAiRejection(null);

    try {
      const res = await previewPrediction(target, token);
      if (res?.prediction) {
        setInstantPrediction(res.prediction);
        if (res.prediction.status === "VALID") {
          setSuccess(`AI Detected: ${res.prediction.category} (${(res.prediction.confidence * 100).toFixed(1)}% confidence) - Department: ${res.prediction.assignedDepartment || res.prediction.category}`);
        } else {
          setAiRejection({
            status: res.prediction.status,
            topCategory: res.prediction.topCategory || "Unknown",
            confidence: res.prediction.confidence,
            message: res.prediction.reason || "Image is not recognized as a supported civic issue.",
          });
        }
      }
    } catch (err) {
      setError(err.message || "Failed to analyze image with AI.");
    } finally {
      setPredictingInstant(false);
    }
  };

  const executePrediction = async (fileToSubmit, locToSubmit) => {
    setLoading(true);
    setPredicting(true);
    setError("");
    setSuccess("");
    setAiRejection(null);

    try {
      const targetImage = fileToSubmit || image;
      const targetLoc = locToSubmit || locationData || activeLocationRef.current || null;

      if (!targetImage) {
        throw new Error("Please capture a photo or upload an image before submitting.");
      }

      const response = await createIssue(targetImage, token, priority, targetLoc);
      setIssue(response.issue);
      setSuccess("Issue reported and analyzed successfully.");
    } catch (submitError) {
      const aiStatus = submitError.data?.aiStatus;
      const topCategory = submitError.data?.topCategory;
      if (aiStatus === "REJECTED" || topCategory === "Human" || topCategory === "Normal Road") {
        const detectedName = topCategory || "Non-civic subject";
        setAiRejection({
          status: aiStatus || "REJECTED",
          topCategory: detectedName,
          confidence: submitError.data?.confidence,
          message: submitError.message || `Image identified as ${detectedName}. Please upload a photo of a civic issue.`,
        });
        setError(submitError.message || `Image identified as ${detectedName}. Please upload a photo of a civic issue.`);
      } else if (aiStatus === "UNCERTAIN") {
        setAiRejection({
          status: "UNCERTAIN",
          topCategory: topCategory || "Unknown",
          confidence: submitError.data?.confidence,
          message: "Low confidence or ambiguous image.",
        });
        setError("Low confidence or ambiguous image.");
      } else {
        setError(submitError.message || "Failed to submit issue.");
      }
    } finally {
      setLoading(false);
      setPredicting(false);
    }
  };

  const capturePhoto = async () => {
    setError("");
    setSuccess("");
    setIssue(null);
    setAiRejection(null);
    setLoading(true);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
        throw new Error("Camera is not ready. Please open the camera and try again.");
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

      setImageSource("camera");
      stopCamera();
      setMode("captured");

      const loc = locationData || activeLocationRef.current || null;
      setLocationData(loc);
      const addr = address || loc?.address || (loc ? `${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}` : "");

      const capturedFile = await renderOverlaidCameraImage(loc, addr);

      if (capturedFile) {
        await executePrediction(capturedFile, loc);
      }
    } catch (captureError) {
      setError(captureError.message || "Failed to capture photo.");
    } finally {
      setLoading(false);
    }
  };

  const clearSelection = () => {
    setImage(null);

    const upload = document.getElementById("imageUpload");
    if (upload) upload.value = "";

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl("");
    setLocationData(null);
    setImageSource(null);
    setIssue(null);
    setSuccess("");
    setError("");
    setInstantPrediction(null);
    setPredictingInstant(false);
    setMode("idle");
    resetLocationUiState();
  };

  // "Retake" jumps straight back into the camera for another shot.
  const retake = () => {
    clearSelection();
    openCamera();
  };

  // "Remove" just clears the current selection entirely.
  const removeImage = () => {
    stopCamera();
    clearSelection();
  };

  const handleFileUpload = async (event) => {
    setError("");
    setSuccess("");
    setIssue(null);
    setAiRejection(null);
    setInstantPrediction(null);
    setPredictingInstant(false);

    const file = event.target.files?.[0];

    if (!file) return;
    const MAX_SIZE = 10 * 1024 * 1024;

    if (file.size > MAX_SIZE) {
      setError("Image must be smaller than 10 MB.");
      return;
    }

    const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

    if (!allowed.includes(file.type)) {
      setError("Please select a valid image file (JPG, JPEG, PNG or WEBP).");
      return;
    }

    resetLocationUiState();

    // Remove previous preview
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setImage(file);
    setPreviewUrl(URL.createObjectURL(file));
    setIssue(null);

    setImageSource("upload");
    stopCamera();
    setMode("captured");

    // Automatically trigger AI prediction in parallel so it is ready immediately
    setPredictingInstant(true);
    previewPrediction(file, token)
      .then((res) => {
        if (res?.prediction) {
          setInstantPrediction(res.prediction);
          if (res.prediction.status === "VALID") {
            setSuccess(`AI Detected: ${res.prediction.category} (${(res.prediction.confidence * 100).toFixed(1)}% confidence) - Department: ${res.prediction.assignedDepartment || res.prediction.category}`);
          } else {
            setAiRejection({
              status: res.prediction.status,
              topCategory: res.prediction.topCategory || "Unknown",
              confidence: res.prediction.confidence,
              message: res.prediction.reason || "Image is not recognized as a supported civic issue.",
            });
          }
        }
      })
      .catch((err) => {
        console.warn("Auto prediction error:", err.message);
      })
      .finally(() => {
        setPredictingInstant(false);
      });

    // Resolve location according to requirement:
    // Priority 1: Image GPS location (embedded EXIF metadata or visible stamp in image)
    // Priority 2: User's current location (when image does not contain GPS location)
    setImageLocationLoading(true);
    let userLoc = activeLocationRef.current || currentLocation;

    // Immediately preserve user's current location as default so the user is never without location
    if (userLoc) {
      setLocationData(userLoc);
      setLocationDenied(false);
      if (userLoc.address) {
        setAddress(userLoc.address);
      }
    }

    try {
      if (!userLoc) {
        try {
          const pos = await getCurrentPosition();
          userLoc = { ...pos, source: "gps" };
          activeLocationRef.current = userLoc;
          setCurrentLocation(userLoc);
          setLocationData(userLoc);
          setLocationDenied(false);
        } catch {
          // Geolocation unavailable or not permitted yet
        }
      }

      const resolved = await previewImageLocation(file, userLoc, token);
      setImageLocationPreview(resolved);

      if (resolved?.hasGps) {
        // If image has its own GPS, use image's coordinates; otherwise use user's current location
        const isFromImage = resolved.source === "exif" || resolved.source === "ocr-stamp";
        setLocationData({
          latitude: resolved.latitude,
          longitude: resolved.longitude,
          accuracy: resolved.accuracy ?? userLoc?.accuracy ?? null,
          source: resolved.source,
        });
        setLocationDenied(false);

        const resolvedAddr = resolved.address || userLoc?.address || "";
        if (resolvedAddr && !resolvedAddr.startsWith("Approximate location") && !/^-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+$/.test(resolvedAddr.trim())) {
          setAddress(resolvedAddr);
        } else {
          loadAddressPreview(resolved.latitude, resolved.longitude);
        }
      } else if (userLoc) {
        setLocationData(userLoc);
        setLocationDenied(false);
        const fallbackAddr = userLoc.address || "";
        if (fallbackAddr && !fallbackAddr.startsWith("Approximate location") && !/^-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+$/.test(fallbackAddr.trim())) {
          setAddress(fallbackAddr);
        } else {
          loadAddressPreview(userLoc.latitude, userLoc.longitude);
        }
      } else {
        setLocationData(null);
        setLocationDenied(true);
      }
    } catch {
      if (userLoc) {
        setLocationData(userLoc);
        setLocationDenied(false);
        const fallbackAddr = userLoc.address || "";
        if (fallbackAddr && !fallbackAddr.startsWith("Approximate location") && !/^-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+$/.test(fallbackAddr.trim())) {
          setAddress(fallbackAddr);
        } else {
          loadAddressPreview(userLoc.latitude, userLoc.longitude);
        }
      } else {
        setImageLocationPreview(null);
        setLocationData(null);
        setLocationDenied(true);
      }
    } finally {
      setImageLocationLoading(false);
    }
  };

  const replaceFile = () => {
    document.getElementById("imageUpload")?.click();
  };

  const applyManualLocation = async (event) => {
    event.preventDefault();
    setManualError("");

    const latitude = Number(manualLatitude);
    const longitude = Number(manualLongitude);

    if (
      manualLatitude.trim() === "" ||
      manualLongitude.trim() === "" ||
      Number.isNaN(latitude) ||
      Number.isNaN(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      setManualError("Enter a valid latitude (-90 to 90) and longitude (-180 to 180).");
      return;
    }

    const loc = {
      latitude,
      longitude,
      accuracy: null,
      captureTimestamp: new Date().toISOString(),
      source: "manual",
    };

    setLocationData(loc);
    setLocationDenied(false);
    setError("");

    const resolvedAddress = await loadAddressPreview(latitude, longitude);

    if (imageSource === "camera") {
      await renderOverlaidCameraImage(loc, resolvedAddress);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setSuccess("");
    setIssue(null);
    setAiRejection(null);
    setLoading(true);
    setPredicting(true);

    try {
      if (!image) {
        throw new Error("Please capture a photo or upload an image before submitting.");
      }
      // Camera captures have no EXIF GPS of their own, so browser (or
      // manually entered) location is required there. Uploaded images may
      // carry their own EXIF GPS - the backend checks for that and only
      // needs browser location (if any) as a fallback, so it isn't
      // required client-side here.
      if (imageSource === "camera" && !locationData) {
        throw new Error("Location data is missing. Please allow location access or enter it manually before submitting.");
      }

      const resolvedLocation = locationData || activeLocationRef.current || currentLocation;
      const locPayload = resolvedLocation
        ? { ...resolvedLocation, address: address || resolvedLocation.address }
        : (address ? { address } : null);

      const response = await createIssue(image, token, priority, locPayload);
      setAiRejection(null);
      setIssue(response.issue);
      setSuccess("Issue reported and analyzed successfully.");
    } catch (submitError) {
      setIssue(null);
      // The AI layer never invents a category for an image it isn't
      // confident about (see backend/controllers/issueController.js) - it
      // reports REJECTED (not a supported civic issue) or UNCERTAIN (might
      // be one, but the photo isn't clear enough) instead, via
      // error.data.aiStatus. Give the citizen guidance specific to which
      // one happened; anything else (GPS errors, network errors, etc.)
      // falls back to the plain server message exactly as before.
      const aiStatus = submitError.data?.aiStatus;
      if (aiStatus === "REJECTED") {
        setError(
          "Image not recognized as a supported civic issue. Please upload a clear image showing a pothole, drainage issue, garbage/dumping, or water leakage."
        );
      } else if (aiStatus === "UNCERTAIN") {
        setError("Low confidence or ambiguous image.");
      } else {
        setError(submitError.message);
      }
    } finally {
      setLoading(false);
      setPredicting(false);
    }
  };

  if (!token) {
    return (
      <main className="report-page">
        <div className="report-card">
          <h1>Login Required</h1>
          <p>Please login before reporting a civic issue.</p>
          <button onClick={() => navigate("/login")}>Go to Login</button>
        </div>
      </main>
    );
  }

  const showUploadOverlayPreview =
    imageSource === "upload" && mode === "captured" && imageLocationPreview?.hasGps;

  return (
    <main className="report-page">
      <div className="report-card">
        <h1>Report an Issue</h1>
        <p className="report-description">
          Capture the issue using your camera or upload an existing geo-tagged image. Your location is automatically recorded when capturing with the camera.
        </p>

        <div className="current-location-banner">
          <span className="location-icon">📍</span>
          <span className="location-label">Current Location:</span>
          <span className="location-text">
            {address
              ? address
              : locationLoading
              ? "Detecting current location..."
              : locationDenied
              ? "Location access unavailable (please enable GPS/location)"
              : "Detecting current location..."}
          </span>
        </div>

        <div className="camera-section">
          {mode === "camera" && (
            <div className="camera-preview-container">
              <video ref={videoRef} className="camera-preview" autoPlay playsInline muted />
            </div>
          )}

          {mode === "captured" && previewUrl && (
            <div className="camera-preview-container geo-preview-wrap">
              <img className="image-preview" src={previewUrl} alt="Captured issue preview" />

              {showUploadOverlayPreview && (
                <div className="geo-overlay">
                  <p className="geo-overlay-address">
                    📍 {imageLocationLoading ? "Resolving address..." : imageLocationPreview.address || "Address unavailable"}
                  </p>
                  <p className="geo-overlay-coords">
                    {imageLocationPreview.latitude.toFixed(6)}, {imageLocationPreview.longitude.toFixed(6)}
                  </p>
                  <p className="geo-overlay-meta">
                    {imageLocationPreview.accuracy ? `Accuracy: ${Math.round(imageLocationPreview.accuracy)}m • ` : ""}
                    {imageLocationPreview.source === "exif"
                      ? "From image GPS metadata"
                      : imageLocationPreview.source === "ocr-stamp"
                      ? "From image GPS stamp"
                      : "From user current location"}
                  </p>
                </div>
              )}
            </div>
          )}

          {imageSource === "camera" && locationData && (
            <div className="location-info">
              <p>
                <strong>📍 Address:</strong> {addressLoading ? "Resolving address..." : address || "Address unavailable"}
              </p>
              <p><strong>Latitude:</strong> {locationData.latitude.toFixed(6)}</p>
              <p><strong>Longitude:</strong> {locationData.longitude.toFixed(6)}</p>
              <p>
                <strong>Accuracy:</strong>{" "}
                {locationData.accuracy ? `${locationData.accuracy.toFixed(1)} m` : "N/A (manually entered)"}
              </p>
            </div>
          )}

          {imageSource === "upload" && (
            <div className="location-info">
              <p>
                Location will be read from the image&apos;s GPS metadata or
                visible GPS stamp, if present. Your device location is only
                used as a fallback when the image has neither.
              </p>
              {imageLocationLoading && <p>Resolving location…</p>}
              {!imageLocationLoading && imageLocationPreview?.hasGps && (
                <>
                  {imageLocationPreview.address && (
                    <p><strong>📍 {imageLocationPreview.source === "exif" || imageLocationPreview.source === "ocr-stamp" ? "Image address:" : "Nearby address:"}</strong> {imageLocationPreview.address}</p>
                  )}
                  <p>
                    <strong>
                      Location source:{" "}
                      {imageLocationPreview.source === "exif"
                        ? "Image GPS (from photo metadata)"
                        : imageLocationPreview.source === "ocr-stamp"
                        ? "Image GPS stamp"
                        : "User Current Location (Device GPS)"}
                      :
                    </strong>{" "}
                    {imageLocationPreview.latitude.toFixed(6)}, {imageLocationPreview.longitude.toFixed(6)}
                    {imageLocationPreview.accuracy ? ` (±${Math.round(imageLocationPreview.accuracy)}m)` : ""}
                  </p>
                </>
              )}
              {!imageLocationLoading && imageLocationPreview && !imageLocationPreview.hasGps && (
                <p>
                  No GPS metadata or visible GPS stamp was found in this image,
                  and no device location is available. Please enable location
                  access or choose a geo-tagged image.
                </p>
              )}
            </div>
          )}

          {locationDenied && mode === "captured" && (
            <div className="manual-location">
              <p className="manual-location-hint">{LOCATION_PERMISSION_MESSAGE}</p>
              {!showManualEntry && (
                <button
                  type="button"
                  className="camera-btn secondary"
                  onClick={() => setShowManualEntry(true)}
                >
                  Enter location manually
                </button>
              )}

              {showManualEntry && (
                <form className="manual-location-form" onSubmit={applyManualLocation}>
                  <div className="manual-location-row">
                    <label htmlFor="manualLat">Latitude</label>
                    <input
                      id="manualLat"
                      type="number"
                      step="any"
                      placeholder="e.g. 16.306700"
                      value={manualLatitude}
                      onChange={(event) => setManualLatitude(event.target.value)}
                    />
                  </div>
                  <div className="manual-location-row">
                    <label htmlFor="manualLng">Longitude</label>
                    <input
                      id="manualLng"
                      type="number"
                      step="any"
                      placeholder="e.g. 80.436500"
                      value={manualLongitude}
                      onChange={(event) => setManualLongitude(event.target.value)}
                    />
                  </div>
                  {manualError && <p className="manual-location-error">{manualError}</p>}
                  <button type="submit" className="camera-btn">
                    Use this location
                  </button>
                </form>
              )}
            </div>
          )}

          <canvas ref={canvasRef} className="capture-canvas" aria-hidden="true" />
          <canvas ref={overlayCanvasRef} className="capture-canvas" aria-hidden="true" />
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/*"
            id="imageUpload"
            onChange={handleFileUpload}
            hidden
          />
          <div className="camera-actions">
            {mode === "idle" && (
              <>
                <button type="button" className="camera-btn" onClick={openCamera}>
                  📷 Take Photo
                </button>

                <label htmlFor="imageUpload" className="camera-btn secondary">
                  📁 Upload File
                </label>
              </>
            )}

            {mode === "camera" && (
              <>
                <button type="button" className="camera-btn" onClick={capturePhoto} disabled={loading}>
                  {loading ? (predicting ? "Predicting..." : "Capturing...") : "Capture Photo"}
                </button>
                <button type="button" className="camera-btn secondary" onClick={removeImage} disabled={loading}>
                  Cancel
                </button>
              </>
            )}

            {mode === "captured" && (
              <button
                type="button"
                className="camera-btn"
                onClick={handleInstantPrediction}
                disabled={loading || predictingInstant}
                style={{ backgroundColor: "#0284c7", color: "#fff" }}
              >
                {predictingInstant ? "⚡ Running AI..." : "⚡ Instant AI Prediction"}
              </button>
            )}

            {mode === "captured" && imageSource === "camera" && (
              <>
                <button type="button" className="camera-btn secondary" onClick={retake}>
                  Retake
                </button>
                <button type="button" className="camera-btn danger" onClick={removeImage}>
                  Remove
                </button>
              </>
            )}

            {mode === "captured" && imageSource === "upload" && (
              <>
                <button type="button" className="camera-btn secondary" onClick={replaceFile}>
                  Replace
                </button>
                <button type="button" className="camera-btn danger" onClick={removeImage}>
                  Remove
                </button>
              </>
            )}
          </div>
        </div>

        {(loading || predictingInstant) && (
          <div
            className="immediate-feedback-banner"
            style={{
              padding: "12px 16px",
              margin: "12px 0",
              borderRadius: "8px",
              background: "#eff6ff",
              border: "1px solid #93c5fd",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              color: "#1d4ed8",
              fontWeight: 500,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: "18px",
                height: "18px",
                border: "3px solid #bfdbfe",
                borderTopColor: "#2563eb",
                borderRadius: "50%",
                animation: "spin 0.7s linear infinite",
              }}
            />
            <span>
              {predictingInstant
                ? "⚡ Running instant neural network classification (~100ms)..."
                : "🚀 Uploading issue and executing AI classification pipeline..."}
            </span>
          </div>
        )}

        {instantPrediction && (
          <section
            className="result-card instant-prediction-banner"
            style={{
              marginTop: "16px",
              borderColor: instantPrediction.status === "VALID" ? "#22c55e" : "#eab308",
              backgroundColor: instantPrediction.status === "VALID" ? "rgba(34, 197, 94, 0.08)" : "rgba(234, 179, 8, 0.08)",
            }}
          >
            <h3>⚡ Instant AI Prediction</h3>
            <p><strong>Status:</strong> <span className={`badge-${(instantPrediction.status || "").toLowerCase()}`}>{instantPrediction.status}</span></p>
            <p><strong>Predicted Category:</strong> {instantPrediction.category !== "Unknown" ? instantPrediction.category : instantPrediction.topCategory}</p>
            <p><strong>Confidence:</strong> {(instantPrediction.confidence * 100).toFixed(1)}%</p>
            {instantPrediction.assignedDepartment && (
              <p><strong>Assigned Department:</strong> {instantPrediction.assignedDepartment}</p>
            )}
            {instantPrediction.reason && (
              <p><strong>Notice:</strong> {instantPrediction.reason}</p>
            )}
          </section>
        )}

        {error && (
          <div
            className="error-banner"
            style={{
              padding: "12px 16px",
              margin: "12px 0",
              borderRadius: "8px",
              background: "#fef2f2",
              border: "1px solid #f87171",
              color: "#b91c1c",
              fontWeight: 500,
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {success && (
          <div
            className="success-banner"
            style={{
              padding: "12px 16px",
              margin: "12px 0",
              borderRadius: "8px",
              background: "#f0fdf4",
              border: "1px solid #86efac",
              color: "#15803d",
              fontWeight: 500,
            }}
          >
            ✅ {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: "16px" }}>
            <label htmlFor="issueAddress" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
              📍 Location Address
            </label>
            <input
              id="issueAddress"
              type="text"
              value={address || ((addressLoading || imageLocationLoading) ? "Resolving location address..." : (locationData ? `${locationData.latitude.toFixed(6)}, ${locationData.longitude.toFixed(6)}` : ""))}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Location detected from GPS / image stamp"
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.08)",
                color: "#fff",
                fontSize: "14px",
                boxSizing: "border-box",
              }}
            />
          </div>

          <label htmlFor="priority">Priority (optional)</label>
          <select id="priority" value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
            <option>Critical</option>
          </select>

          <button
            type="submit"
            disabled={loading || mode !== "captured" || !image}
            style={{
              padding: "12px 24px",
              fontWeight: "bold",
              cursor: loading || mode !== "captured" || !image ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "⚡ Processing & Submitting Issue..." : "🚀 Upload & Submit Issue"}
          </button>
        </form>

        {issue && (
          <section className="result-card">
            <h2>Report created</h2>
            <p><strong>Issue ID:</strong> {issue._id}</p>
            <p><strong>Detected category:</strong> {issue.category}</p>
            <p><strong>AI confidence:</strong> {(issue.aiPrediction.confidence * 100).toFixed(2)}%</p>
            <p><strong>Department:</strong> {issue.assignedDepartment}</p>
            <p><strong>Status:</strong> {issue.status}</p>
            <p><strong>Coordinates:</strong> {issue.location.latitude}, {issue.location.longitude}</p>
            <p><strong>Address:</strong> {issue.location.address}</p>
          </section>
        )}

        {!issue && aiRejection && (
          <section className="result-card rejection-card">
            <h2>AI Detection Notice</h2>
            <p><strong>Status:</strong> <span className="badge-rejected">{aiRejection.status}</span></p>
            <p>
              <strong>Detected Object:</strong>{" "}
              {aiRejection.topCategory === "Human"
                ? "Person / Human (Non-Civic)"
                : aiRejection.topCategory === "Normal Road"
                ? "Normal Road (No Issue Detected)"
                : !aiRejection.confidence || aiRejection.confidence < 0.35 || aiRejection.topCategory === "Non-Civic Subject" || aiRejection.topCategory === "Unknown"
                ? "Non-Civic Subject / Unrecognized"
                : aiRejection.topCategory}
            </p>
            {aiRejection.confidence && aiRejection.confidence >= 0.35 && (
              <p><strong>Confidence:</strong> {(aiRejection.confidence * 100).toFixed(2)}%</p>
            )}
            <p>
              <strong>Notice:</strong>{" "}
              {aiRejection.status === "UNCERTAIN"
                ? "Low confidence or ambiguous image."
                : (aiRejection.message || "").replace(/Please upload a photo showing a supported civic issue.*$/i, "").trim()}
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

export default ReportIssue;
