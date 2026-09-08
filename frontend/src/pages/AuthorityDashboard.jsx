import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/useToast";
import {
  assignIssue,
  getAllIssues,
  getDashboardStats,
  getDepartmentStats,
  getRecentIssues,
  updateIssueStatus,
} from "../services/issueService";
import CameraCaptureModal from "../components/CameraCaptureModal";
import "./Dashboard.css";

// Mirrors backend/constants/issueCategories.js's ALLOWED_STATUS_TRANSITIONS.
// The backend is still the source of truth/enforcement (see issueService.js
// updateIssueStatus) - this copy only drives which options the dropdown
// offers so an authority never sees a transition the API would reject.
const transitions = {
  Pending: ["Assigned", "Rejected"],
  Assigned: ["Pending", "In Progress", "Rejected"],
  "In Progress": ["Assigned", "Resolved", "Rejected"],
  Resolved: [],
  Rejected: [],
};

const apiBase = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/api$/, "");

function StatusBadge({ status }) {
  return (
    <span className={`status status-${status.toLowerCase().replace(/\s+/g, "-")}`}>
      {status}
    </span>
  );
}

export default function AuthorityDashboard() {
  const { token, user } = useAuth();
  const { showToast } = useToast();

  const [issues, setIssues] = useState([]);
  const [stats, setStats] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [recentIssues, setRecentIssues] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const [manageIssueId, setManageIssueId] = useState(null);
  const [manageStatus, setManageStatus] = useState("");
  const [manageRemarks, setManageRemarks] = useState("");
  const [manageProofFile, setManageProofFile] = useState(null);
  // Best-effort browser/device GPS captured when the evidence photo is
  // attached - only ever used server-side as a fallback when the photo has
  // no usable EXIF GPS of its own (see gpsService.resolveGpsLocation).
  const [manageEvidenceLocation, setManageEvidenceLocation] = useState(null);
  const [manageLocationStatus, setManageLocationStatus] = useState("idle");
  const [manageSubmitting, setManageSubmitting] = useState(false);
  const [manageError, setManageError] = useState("");
  // Live camera capture modal (Feature: Authority Live Camera Capture).
  // The modal itself never touches the network/GPS - once a photo is
  // captured it's handed to the exact same handleProofFileChange used by
  // the plain file input below, so both paths share one upload/GPS flow.
  const [cameraOpen, setCameraOpen] = useState(false);

  // Bumping reloadIndex re-runs the effect below, giving callers (assign,
  // status update) a way to trigger a refresh without calling an external
  // async function from inside the effect, and without a full page reload.
  const [reloadIndex, setReloadIndex] = useState(0);
  const refreshDashboard = () => setReloadIndex((n) => n + 1);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    let ignore = false;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const [allIssues, dashboardStats, departmentStats, recent] = await Promise.all([
          getAllIssues(token),
          getDashboardStats(token),
          getDepartmentStats(token),
          getRecentIssues(token),
        ]);

        if (ignore) return;

        setIssues(allIssues.issues || []);
        setStats(dashboardStats);
        setDepartments(departmentStats.departments || []);
        setRecentIssues(recent.issues || []);
      } catch (err) {
        if (!ignore) {
          setError(err.message);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    })();

    return () => {
      ignore = true;
    };
  }, [token, reloadIndex]);

  const assignToMe = async (issue) => {
    try {
      await assignIssue(issue._id, user.id, token);
      showToast(`"${issue.title}" assigned to you.`, "success");
      refreshDashboard();
    } catch (err) {
      setError(err.message);
      showToast(err.message || "Could not assign issue.", "error");
    }
  };

  const openManagePanel = (issue) => {
    setManageIssueId(issue._id);
    setManageStatus("");
    setManageRemarks("");
    setManageProofFile(null);
    setManageEvidenceLocation(null);
    setManageLocationStatus("idle");
    setManageError("");
    setCameraOpen(false);
  };

  const closeManagePanel = () => {
    setManageIssueId(null);
    setManageStatus("");
    setManageRemarks("");
    setManageProofFile(null);
    setManageEvidenceLocation(null);
    setManageLocationStatus("idle");
    setManageError("");
    setCameraOpen(false);
  };

  // Called whenever the authority attaches/captures a resolution-evidence
  // image. Browser GPS is collected best-effort here purely as a fallback -
  // the backend always prefers EXIF GPS embedded in the photo itself, so a
  // denied/unavailable browser location never blocks the upload.
  const handleProofFileChange = (file) => {
    setManageProofFile(file);
    setManageEvidenceLocation(null);

    if (!file) {
      setManageLocationStatus("idle");
      return;
    }

    if (!navigator.geolocation) {
      setManageLocationStatus("unavailable");
      return;
    }

    setManageLocationStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setManageEvidenceLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          captureTimestamp: new Date(position.timestamp).toISOString(),
        });
        setManageLocationStatus("captured");
      },
      () => {
        // Denied/unavailable - fine, EXIF GPS on the image (if any) is
        // still checked server-side.
        setManageLocationStatus("unavailable");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const submitManagePanel = async (issue) => {
    if (!manageStatus && !manageRemarks.trim() && !manageProofFile) {
      setManageError("Choose a new status, add remarks, or attach a completion proof image.");
      return;
    }

    try {
      setManageSubmitting(true);
      setManageError("");

      const result = await updateIssueStatus(
        issue._id,
        {
          status: manageStatus || undefined,
          remarks: manageRemarks.trim() || undefined,
          completionProofFile: manageProofFile,
          evidenceLocation: manageEvidenceLocation,
        },
        token
      );

      showToast(
        manageStatus ? `Status updated to "${manageStatus}".` : "Update saved.",
        "success"
      );

      // The evidence's own coordinates are never altered by this check -
      // it's purely an informational heads-up when the resolution photo's
      // authentic location is far from the original issue's authentic
      // location (see gpsService.verifyResolutionLocation).
      const verification = result?.issue?.completionProofLocation;
      if (verification?.verified === false && verification?.verificationMessage) {
        showToast(verification.verificationMessage, "error");
      }

      closeManagePanel();
      refreshDashboard();
    } catch (err) {
      setManageError(err.message);
      showToast(err.message || "Could not update issue.", "error");
    } finally {
      setManageSubmitting(false);
    }
  };

  const filteredIssues = issues.filter((issue) => {
    const matchesSearch = (issue.title + " " + issue.category + " " + issue.assignedDepartment)
      .toLowerCase()
      .includes(search.toLowerCase());

    const matchesStatus = statusFilter === "All" || issue.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return <div className="dashboard-loading">Loading Dashboard...</div>;
  }

  return (
    <main className="dashboard-page">
      <div className="dashboard-container">
        <h1>Authority Dashboard</h1>

        {error && <div className="error-message">{error}</div>}

        {stats && (
          <div className="stats-grid">
            <div className="stat-card">
              <h2>{stats.totalIssues}</h2>
              <p>Total Issues</p>
            </div>
            <div className="stat-card">
              <h2>{stats.pending}</h2>
              <p>Pending</p>
            </div>
            <div className="stat-card">
              <h2>{stats.assigned}</h2>
              <p>Assigned</p>
            </div>
            <div className="stat-card">
              <h2>{stats.inProgress}</h2>
              <p>In Progress</p>
            </div>
            <div className="stat-card">
              <h2>{stats.resolved}</h2>
              <p>Resolved</p>
            </div>
          </div>
        )}

        <section className="dashboard-section">
          <h2>Department Workload</h2>

          {departments.length === 0 ? (
            <p>No issues found.</p>
          ) : (
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Total Issues</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((item) => (
                  <tr key={item.department}>
                    <td>{item.department}</td>
                    <td>{item.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="dashboard-section">
          <h2>Issues</h2>

          <div className="dashboard-filters">
            <input
              type="text"
              placeholder="Search issues..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option>All</option>
              {Object.keys(transitions).map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </div>

          {filteredIssues.length === 0 ? (
            <div className="empty-state">
              <h2>No matching issues</h2>
              <p>Try adjusting your search or filter.</p>
            </div>
          ) : (
            <div className="issue-grid">
              {filteredIssues.map((issue) => {
                const isManaging = manageIssueId === issue._id;
                const canManage = Boolean(issue.assignedTo);
                const latestHistory = [...(issue.statusHistory || [])].reverse();

                return (
                  <article className="authority-issue-card" key={issue._id}>
                    <div className="authority-issue-media">
                      {issue.image ? (
                        <img src={`${apiBase}${issue.image}`} alt={issue.category} loading="lazy" />
                      ) : (
                        <div className="authority-issue-media-placeholder">No image</div>
                      )}
                      <StatusBadge status={issue.status} />
                    </div>

                    <div className="authority-issue-body">
                      <h3>
                        <Link to={`/issues/${issue._id}`}>{issue.title}</Link>
                      </h3>

                      <div className="authority-issue-meta">
                        <span>
                          <strong>Category:</strong> {issue.category}
                        </span>
                        <span>
                          <strong>Department:</strong> {issue.assignedDepartment}
                        </span>
                        <span>
                          <strong>Address:</strong> {issue.location?.address || "Not provided"}
                        </span>
                        {issue.location?.latitude != null && issue.location?.longitude != null && (
                          <span>
                            <strong>Coordinates:</strong>{" "}
                            {issue.location.latitude.toFixed(6)}, {issue.location.longitude.toFixed(6)}
                          </span>
                        )}
                        <span>
                          <strong>Reported:</strong>{" "}
                          {issue.createdAt ? new Date(issue.createdAt).toLocaleString() : "Unknown"}
                        </span>
                        <span>
                          <strong>Assigned to:</strong> {issue.assignedTo?.name || "Unassigned"}
                        </span>
                      </div>

                      {issue.remarks && (
                        <p className="authority-issue-remarks">
                          <strong>Latest remarks:</strong> {issue.remarks}
                        </p>
                      )}

                      {latestHistory.length > 0 && (
                        <details className="authority-issue-history">
                          <summary>Status history ({latestHistory.length})</summary>
                          <ul>
                            {latestHistory.map((entry, index) => (
                              <li key={`${issue._id}-history-${index}`}>
                                <StatusBadge status={entry.status} />
                                <span className="authority-history-meta">
                                  {entry.changedBy?.name || "System"} &middot;{" "}
                                  {entry.changedAt ? new Date(entry.changedAt).toLocaleString() : ""}
                                </span>
                                {entry.remarks && <p>{entry.remarks}</p>}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}

                      <div className="authority-issue-actions">
                        {!issue.assignedTo && issue.status === "Pending" && (
                          <button type="button" onClick={() => assignToMe(issue)}>
                            Assign To Me
                          </button>
                        )}

                        {canManage && (
                          <button
                            type="button"
                            className={isManaging ? "secondary" : ""}
                            onClick={() => (isManaging ? closeManagePanel() : openManagePanel(issue))}
                          >
                            {isManaging ? "Cancel" : "Update Status"}
                          </button>
                        )}
                      </div>

                      {isManaging && (
                        <div className="manage-panel">
                          <div className="manage-field">
                            <label htmlFor={`status-${issue._id}`}>Change status</label>
                            <select
                              id={`status-${issue._id}`}
                              value={manageStatus}
                              onChange={(e) => setManageStatus(e.target.value)}
                            >
                              <option value="">Keep current status ({issue.status})</option>
                              {transitions[issue.status].map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="manage-field">
                            <label htmlFor={`remarks-${issue._id}`}>Add remarks</label>
                            <textarea
                              id={`remarks-${issue._id}`}
                              rows={2}
                              placeholder="e.g. Team dispatched, repair scheduled for tomorrow."
                              value={manageRemarks}
                              onChange={(e) => setManageRemarks(e.target.value)}
                            />
                          </div>

                          <div className="manage-field">
                            <label htmlFor={`proof-${issue._id}`}>
                              Resolution Evidence — capture or upload a photo of the resolved
                              condition (optional)
                            </label>
                            <div className="manage-proof-controls">
                              <input
                                id={`proof-${issue._id}`}
                                type="file"
                                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                                capture="environment"
                                onChange={(e) => handleProofFileChange(e.target.files?.[0] || null)}
                              />
                              <button type="button" className="secondary" onClick={() => setCameraOpen(true)}>
                                📷 Capture Resolution Photo
                              </button>
                            </div>
                            {manageProofFile && (
                              <span className="manage-hint">Selected: {manageProofFile.name}</span>
                            )}
                            {manageProofFile && manageLocationStatus === "locating" && (
                              <span className="manage-hint">Capturing device location…</span>
                            )}
                            {manageProofFile && manageLocationStatus === "captured" && (
                              <span className="manage-hint">
                                Device location captured (used only if the photo has no GPS of its
                                own).
                              </span>
                            )}
                            {manageProofFile && manageLocationStatus === "unavailable" && (
                              <span className="manage-hint">
                                Device location unavailable — the photo&apos;s own GPS data (if
                                any) will still be used.
                              </span>
                            )}
                          </div>

                          {manageError && <div className="error-message">{manageError}</div>}

                          <div className="manage-actions">
                            <button
                              type="button"
                              onClick={() => submitManagePanel(issue)}
                              disabled={manageSubmitting}
                            >
                              {manageSubmitting ? "Saving..." : "Save Update"}
                            </button>
                            <button type="button" className="secondary" onClick={closeManagePanel}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="dashboard-section">
          <h2>Recent Issues</h2>

          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Issue</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentIssues.map((issue) => (
                <tr key={issue._id}>
                  <td>{issue.title}</td>
                  <td>
                    <StatusBadge status={issue.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {cameraOpen && (
        <CameraCaptureModal
          onCapture={(file) => {
            handleProofFileChange(file);
            setCameraOpen(false);
          }}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </main>
  );
}
