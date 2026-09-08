import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import SmartCityLogo from "./SmartCityLogo";
import "./SmartCityLogo.css";
import "./Navbar.css";

function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile drawer whenever the route changes, so navigating never
  // leaves it open over the next page. Adjusting state during render (per
  // React's "you might not need an effect" guidance) instead of in a
  // useEffect avoids an extra cascading render on every navigation.
  const [menuOpenForPathname, setMenuOpenForPathname] = useState(location.pathname);
  if (location.pathname !== menuOpenForPathname) {
    setMenuOpenForPathname(location.pathname);
    setMenuOpen(false);
  }

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-logo">
        <SmartCityLogo size={28} className="on-dark" />
        <span>Smart City</span>
      </Link>

      <button
        type="button"
        className={`navbar-toggle${menuOpen ? " is-open" : ""}`}
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span />
        <span />
        <span />
      </button>

      <div className={`navbar-links${menuOpen ? " is-open" : ""}`}>
        <Link to="/" className={isActive("/") ? "is-active" : ""}>
          Home
        </Link>

        {user?.role === "citizen" && (
          <>
            <Link to="/report-issue" className={isActive("/report-issue") ? "is-active" : ""}>
              Report Issue
            </Link>
            <Link to="/track-issue" className={isActive("/track-issue") ? "is-active" : ""}>
              Track Issues
            </Link>
            <Link to="/dashboard" className={isActive("/dashboard") ? "is-active" : ""}>
              Dashboard
            </Link>
          </>
        )}
        {user?.role === "authority" && (
          <Link to="/authority" className={isActive("/authority") ? "is-active" : ""}>
            Authority Dashboard
          </Link>
        )}
        {user?.role === "administrator" && (
          <Link to="/admin" className={isActive("/admin") ? "is-active" : ""}>
            Administrator Dashboard
          </Link>
        )}
        {user && (
          <Link to="/notifications" className={isActive("/notifications") ? "is-active" : ""}>
            Notifications
          </Link>
        )}
        {user && (
          <Link to="/profile" className={isActive("/profile") ? "is-active" : ""}>
            Profile
          </Link>
        )}
        {user && (
          <Link to="/settings" className={isActive("/settings") ? "is-active" : ""}>
            Settings
          </Link>
        )}
        <Link to="/contact" className={isActive("/contact") ? "is-active" : ""}>
          Contact
        </Link>

        <div className="navbar-links-divider" />

        {!user ? (
          <div className="navbar-auth">
            <Link to="/login" className="navbar-login">
              Login
            </Link>
            <Link to="/register" className="navbar-register">
              Register
            </Link>
          </div>
        ) : (
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
