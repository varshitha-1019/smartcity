import { Link } from "react-router-dom";
import "./Footer.css";

function Footer() {
  return (
    <footer className="app-footer">
      <div className="footer-content">
        <span>© {new Date().getFullYear()} AI Based Urban Smart City Monitoring System</span>

        <div className="footer-links">
          <Link to="/">Home</Link>
          <Link to="/contact">Contact</Link>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
