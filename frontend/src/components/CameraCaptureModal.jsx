import { useEffect, useRef, useState } from "react";
import "./CameraCaptureModal.css";

/**
 * A self-contained live-camera capture modal built on
 * navigator.mediaDevices.getUserMedia(). It never talks to the backend or
 * to GPS itself - it only ever hands the parent a plain File (JPEG) via
 * onCapture, so the parent's existing upload/GPS/status-update flow
 * (AuthorityDashboard's handleProofFileChange -> updateIssueStatus) is
 * reused completely unchanged for camera captures, exactly like it already
 * is for file-picker uploads.
 *
 * The parent is expected to only render this component while it should be
 * visible (e.g. `{cameraOpen && <CameraCaptureModal ... />}`), so every
 * mount starts a fresh camera session and every unmount releases it - no
 * internal "open" prop/reset-on-change bookkeeping needed.
 *
 * Props:
 *   - onCapture(file): called once with a File when the authority accepts
 *     a photo ("Use Photo")
 *   - onClose(): called when the modal should close without capturing
 *     (Cancel, backdrop click, or an unrecoverable camera error)
 */
function CameraCaptureModal({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const cameraSupported =
    typeof navigator !== "undefined" && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;

  // "starting" | "live" | "preview" | "error" - computed once at mount via
  // lazy initializers (rather than set from inside the effect below) so
  // the "unsupported browser" case never needs a synchronous setState
  // call in an effect body.
  const [phase, setPhase] = useState(() => (cameraSupported ? "starting" : "error"));
  const [errorMessage, setErrorMessage] = useState(() =>
    cameraSupported ? "" : "Camera capture isn't supported in this browser. Please use the upload option instead."
  );
  const [previewUrl, setPreviewUrl] = useState(null);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    if (!cameraSupported) {
      return undefined;
    }

    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setPhase("live");
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase("error");
        setErrorMessage(
          err && err.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access, or use the upload option instead."
            : "Couldn't access the camera. Please use the upload option instead."
        );
      });

    return () => {
      cancelled = true;
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Release the captured-frame object URL when the component unmounts
    // (e.g. the authority accepts/cancels), so we never leak memory.
    return () => {
      setPreviewUrl((existing) => {
        if (existing) URL.revokeObjectURL(existing);
        return existing;
      });
    };
  }, []);

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Photo is captured; release the live stream immediately (we already
    // have the frame in the canvas) rather than keeping the camera on
    // while the authority reviews the preview.
    stopStream();

    const url = canvas.toDataURL("image/jpeg", 0.92);
    setPreviewUrl(url);
    setPhase("preview");
  };

  const handleRetake = () => {
    setPreviewUrl(null);
    setPhase("starting");

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setPhase("live");
      })
      .catch(() => {
        setPhase("error");
        setErrorMessage("Couldn't reopen the camera. Please use the upload option instead.");
      });
  };

  const handleUsePhoto = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `resolution-capture-${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture(file);
        handleClose();
      },
      "image/jpeg",
      0.92
    );
  };

  const handleClose = () => {
    stopStream();
    setPhase("starting");
    onClose();
  };

  return (
    <div className="camera-modal-backdrop" onClick={handleClose}>
      <div className="camera-modal" onClick={(e) => e.stopPropagation()}>
        <div className="camera-modal-header">
          <h3>Capture Resolution Photo</h3>
          <button type="button" className="camera-modal-close" onClick={handleClose} aria-label="Close camera">
            ×
          </button>
        </div>

        <div className="camera-modal-body">
          {phase === "error" && <div className="error-message">{errorMessage}</div>}

          {phase === "starting" && (
            <div className="camera-modal-status">Requesting camera access…</div>
          )}

          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="camera-modal-video"
            style={{ display: phase === "live" ? "block" : "none" }}
          />

          {phase === "preview" && previewUrl && (
            <img src={previewUrl} alt="Captured resolution preview" className="camera-modal-preview" />
          )}

          <canvas ref={canvasRef} style={{ display: "none" }} />
        </div>

        <div className="camera-modal-actions">
          {phase === "live" && (
            <>
              <button type="button" onClick={handleCapture}>
                Capture Photo
              </button>
              <button type="button" className="secondary" onClick={handleClose}>
                Cancel
              </button>
            </>
          )}

          {phase === "preview" && (
            <>
              <button type="button" onClick={handleUsePhoto}>
                Use Photo
              </button>
              <button type="button" className="secondary" onClick={handleRetake}>
                Retake
              </button>
              <button type="button" className="secondary" onClick={handleClose}>
                Cancel
              </button>
            </>
          )}

          {(phase === "starting" || phase === "error") && (
            <button type="button" className="secondary" onClick={handleClose}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default CameraCaptureModal;
