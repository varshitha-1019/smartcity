/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getMyIssues } from "../services/issueService";
import IssueCard from "../components/IssueCard";
import LoadingSpinner from "../components/LoadingSpinner";
import "./TrackIssue.css";

function TrackIssue() {
  const { token } = useAuth();

  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadIssues = async () => {
      try {
        const data = await getMyIssues(token);
        setIssues(data.issues || []);
      } catch (error) {
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      loadIssues();
    } else {
      setLoading(false);
    }
  }, [token]);

  if (!token) {
    return (
      <main className="track-page">
        <div className="track-container">
          <h1>Track Issues</h1>
          <p>Please login to view your reported issues.</p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="track-page">
        <div className="track-container">
          <h1>Track Issues</h1>
          <LoadingSpinner label="Loading your issues…" />
        </div>
      </main>
    );
  }

  return (
    <main className="track-page">
      <div className="track-container">
        <h1>My Reported Issues</h1>

        {error && <div className="error-message">{error}</div>}

        {!error && issues.length === 0 && (
          <div className="empty-state">
            <h2>No issues reported yet</h2>
            <p>Your reported civic issues will appear here.</p>
          </div>
        )}

        <div className="issue-list">
          {issues.map((issue) => (
            <IssueCard issue={issue} key={issue._id} />
          ))}
        </div>
      </div>
    </main>
  );
}

export default TrackIssue;
