import SmartCityLogo from "./SmartCityLogo";
import "./SplashScreen.css";

// Shown once, in-memory, for the first ~2.5s of the app's lifetime (see the
// timer in App.jsx). No localStorage/sessionStorage flag is used - a full
// page load is the only way to see this component mount in the first
// place, so any persisted "already shown" flag would be redundant state
// with no real effect other than one more thing that can go stale.
function SplashScreen({ fadingOut = false }) {
  return (
    <div
      className={`splash-screen${fadingOut ? " splash-screen--out" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="splash-content">
        <SmartCityLogo size={88} className="on-dark splash-logo" />
        <h1 className="splash-title">Smart City</h1>
        <p className="splash-subtitle">AI-Powered Urban Civic Issue Management</p>
        <div className="splash-loader" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

export default SplashScreen;
