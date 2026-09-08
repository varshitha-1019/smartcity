import "./LoadingSpinner.css";

function LoadingSpinner({ label = "Loading…" }) {
  return (
    <div className="loading-spinner-wrapper" role="status" aria-live="polite">
      <div className="loading-spinner" />
      <span>{label}</span>
    </div>
  );
}

export default LoadingSpinner;
