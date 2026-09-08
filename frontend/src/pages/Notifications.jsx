import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getNotifications } from "../services/notificationService";
import LoadingSpinner from "../components/LoadingSpinner";
import "./Notifications.css";

// Notifications are real events, not a separate fabricated feed: each one
// is a status-history entry that already exists on an issue this user can
// see (see backend/controllers/dashboardController.js's getNotifications),
// so this list is exactly "what actually changed on issues you can access".
function Notifications() {
  const { token } = useAuth();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await getNotifications(token);
        setNotifications(data.notifications || []);
      } catch (err) {
        setError(err.message || "Unable to load notifications.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <main className="notifications-page">
        <LoadingSpinner label="Loading notifications…" />
      </main>
    );
  }

  return (
    <main className="notifications-page">
      <div className="notifications-container">
        <h1>Notifications</h1>

        {error && <div className="error-message">{error}</div>}

        {notifications.length === 0 ? (
          <div className="empty-state">
            <h2>No notifications yet</h2>
            <p>You'll see updates here as soon as something changes on your issues.</p>
          </div>
        ) : (
          <ul className="notification-list">
            {notifications.map((note) => (
              <li key={note.id} className="notification-item">
                <div className="notification-header">
                  <span
                    className={`status status-${note.status.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {note.status}
                  </span>
                  <span className="notification-date">
                    {new Date(note.changedAt).toLocaleString()}
                  </span>
                </div>

                <Link to={`/issues/${note.issueId}`} className="notification-title">
                  {note.issueTitle}
                </Link>

                {note.changedBy && <p className="notification-actor">By {note.changedBy}</p>}
                {note.remarks && <p className="notification-remarks">{note.remarks}</p>}
                {note.hasCompletionProof && (
                  <p className="notification-proof">Completion proof uploaded ✓</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

export default Notifications;
