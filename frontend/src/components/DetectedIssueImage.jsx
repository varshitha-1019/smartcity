import "./DetectedIssueImage.css";

/**
 * Shows the original citizen-reported image exactly as uploaded, with no
 * detection overlay drawn on top of it. The AI classifier used by this app
 * (ai/scripts/predict.py) still returns a category + confidence, and those
 * are shown below the image via the existing badge - only the bounding-box
 * rectangle/label overlay has been removed.
 */
function DetectedIssueImage({ src, alt, category, confidence }) {
  return (
    <div>
      <div className="detected-issue-frame">
        <img src={src} alt={alt} />
      </div>

      {(category || typeof confidence === "number") && (
        <div className="detected-issue-badge">
          {category && <span>Detected category: {category}</span>}
          {typeof confidence === "number" && (
            <span>&middot; AI confidence: {(confidence * 100).toFixed(2)}%</span>
          )}
        </div>
      )}
    </div>
  );
}

export default DetectedIssueImage;
