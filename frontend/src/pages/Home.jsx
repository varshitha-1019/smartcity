import { Link } from "react-router-dom";
import "./Home.css";
function Home() {
  return (
    <main className="home-page">
      <section className="hero-section">
        <div className="hero-content">
          <p className="hero-label">AI-POWERED SMART CITY</p>

          <h1>
            Build a Better
            <br />
            <span>Urban Future</span>
          </h1>

          <p>
            Report civic issues, track complaints, and help authorities
            create a cleaner, safer and smarter city.
          </p>

          <div className="hero-buttons">
            <Link to="/report-issue" className="primary-button">
              Report an Issue
            </Link>

            <Link to="/track-issue" className="secondary-button">
              Track an Issue
            </Link>
          </div>
        </div>
      </section>

      <section className="features-section">
        <h2>How Smart City Monitoring Works</h2>

        <div className="feature-grid">
          <div className="feature-card">
            <h3>01. Report</h3>
            <p>
              Citizens can quickly report potholes, sanitation problems,
              water issues and other civic problems.
            </p>
          </div>

          <div className="feature-card">
            <h3>02. Analyze</h3>
            <p>
              AI-assisted classification helps identify the issue category
              and priority.
            </p>
          </div>

          <div className="feature-card">
            <h3>03. Resolve</h3>
            <p>
              Authorities can manage complaints and update their progress
              until the issue is resolved.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default Home;