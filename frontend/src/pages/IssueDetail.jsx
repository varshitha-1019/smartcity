import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getIssueById, getMyIssues, updateIssueStatus } from "../services/issueService";
import LoadingSpinner from "../components/LoadingSpinner";
import DetectedIssueImage from "../components/DetectedIssueImage";
import "./TrackIssue.css";

const apiBase = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/api$/, "");

function resolveUserLabel(user) {
  if (!user) return "System";
  if (typeof user === "string") return user;
  return user.name || user.email || "Unknown user";
}

function IssueDetail() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const [issue, setIssue] = useState(null);
  const [error, setError] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [remarks, setRemarks] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState("");

  const handleStatusChange = async (e) => {
    e.preventDefault();
    if (!newStatus) return;
    try {
      setUpdating(true);
      setError("");
      const resolved = newStatus === "Completed" ? "Resolved" : newStatus;
      const res = await updateIssueStatus(
        id,
        { status: resolved, remarks: remarks || `Status updated to ${resolved}` },
        token
      );
      if (res?.issue) {
        setIssue(res.issue);
      }
      setUpdateMsg(`Status updated to ${resolved} successfully.`);
      setTimeout(() => setUpdateMsg(""), 4000);
    } catch (err) {
      setError(err.message || "Failed to update status.");
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const data = user.role === "citizen" ? await getMyIssues(token) : await getIssueById(id, token);
        const found = user.role === "citizen" ? data.issues.find((item) => item._id === id) : data.issue;
        if (!found) throw new Error("Issue not found");
        setIssue(found);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [id, token, user.role]);

  if (error) {
    return (
      <main className="track-page">
        <div className="track-container">
          <div className="error-message">{error}</div>
        </div>
      </main>
    );
  }

  if (!issue) {
    return <main className="page-state"><LoadingSpinner label="Loading issue…" /></main>;
  }

  const timeline = [...(issue.statusHistory || [])].sort(
    (a, b) => new Date(a.changedAt) - new Date(b.changedAt)
  );

  return (
    <main className="track-page">
      <div className="track-container">
        <Link to={user.role === "citizen" ? "/track-issue" : user.role === "administrator" ? "/admin" : "/authority"}>← Back</Link>

        <article className="issue-card issue-detail">
          <h1>{issue.title}</h1>
          <p>{issue.description}</p>

          {issue.image && (
            <section className="detected-issue-section">
              <h2>Detected Issue</h2>
              <DetectedIssueImage
                src={`${apiBase}${issue.image}`}
                alt={issue.category}
                category={issue.aiPrediction?.category}
                confidence={issue.aiPrediction?.confidence}
              />
            </section>
          )}

          <div className="issue-details">
            <span><strong>Issue ID:</strong> {issue._id}</span>
            <span><strong>Category:</strong> {issue.category}</span>
            <span><strong>AI confidence:</strong> {(issue.aiPrediction.confidence * 100).toFixed(2)}%</span>
            <span><strong>Department:</strong> {issue.assignedDepartment}</span>
            <span><strong>Priority:</strong> {issue.priority}</span>
            <span><strong>Status:</strong> {issue.status}</span>
            <span><strong>Latitude:</strong> {issue.location.latitude}</span>
            <span><strong>Longitude:</strong> {issue.location.longitude}</span>
            <span><strong>Address:</strong> {issue.location.address}</span>
            <span><strong>Submitted:</strong> {new Date(issue.createdAt).toLocaleString()}</span>
            {issue.resolvedAt && (
              <span><strong>Resolved:</strong> {new Date(issue.resolvedAt).toLocaleString()}</span>
            )}
          </div>

          {(user?.role === "administrator" || user?.role === "authority") && (
            <section className="issue-remarks" style={{ marginTop: "16px", padding: "16px", border: "1px solid var(--border-color, #e2e8f0)", borderRadius: "8px", background: "var(--card-bg, #f8fafc)" }}>
              <h2 style={{ marginBottom: "8px" }}>Manage Issue Status ({user.role === "administrator" ? "Administrator" : "Authority"})</h2>
              {updateMsg && <div className="success-message" style={{ marginBottom: "10px" }}>{updateMsg}</div>}
              <form onSubmit={handleStatusChange} style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                <select
                  value={newStatus || issue.status}
                  onChange={(e) => setNewStatus(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color, #ccc)" }}
                >
                  <option value="Pending">Pending</option>
                  <option value="Assigned">Assigned</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Completed (Resolved)</option>
                  <option value="Rejected">Rejected</option>
                </select>

                <input
                  type="text"
                  placeholder="Optional remarks..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: "6px", flex: "1", minWidth: "200px", border: "1px solid var(--border-color, #ccc)" }}
                />

                <button type="submit" disabled={updating} style={{ padding: "8px 16px", borderRadius: "6px", cursor: "pointer" }}>
                  {updating ? "Saving..." : "Update Status"}
                </button>

                {issue.status !== "Resolved" && (
                  <button
                    type="button"
                    disabled={updating}
                    onClick={() => {
                      setNewStatus("Resolved");
                      setUpdating(true);
                      updateIssueStatus(id, { status: "Resolved", remarks: "Marked Completed by Administrator" }, token)
                        .then((res) => {
                          if (res?.issue) setIssue(res.issue);
                          setUpdateMsg("Issue marked as Completed!");
                          setTimeout(() => setUpdateMsg(""), 4000);
                        })
                        .catch((err) => setError(err.message))
                        .finally(() => setUpdating(false));
                    }}
                    style={{ padding: "8px 16px", backgroundColor: "#16a34a", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }}
                  >
                    ✓ Mark Completed
                  </button>
                )}
              </form>
            </section>
          )}

          {issue.remarks && (
            <section className="issue-remarks">
              <h2>Latest Remarks</h2>
              <p>{issue.remarks}</p>
            </section>
          )}

          {(issue.resolutionEvidence || issue.completionProof) && (
            <section className="completion-proof">
              <h2>Resolution Evidence</h2>
              <p className="evidence-caption">
                Photo uploaded by the assigned authority showing the resolved condition, so you
                can verify the issue has actually been addressed.
              </p>
              <img
                className="issue-image"
                src={`${apiBase}${issue.resolutionEvidence || issue.completionProof}`}
                alt="Authority resolution evidence"
              />

              <div className="evidence-location">
                {issue.completionProofLocation?.source &&
                issue.completionProofLocation.source !== "none" &&
                issue.completionProofLocation.latitude != null ? (
                  <>
                    <span>
                      📍 Location: {issue.completionProofLocation.address || "Address unavailable"}
                    </span>
                    <span>Latitude: {issue.completionProofLocation.latitude}</span>
                    <span>Longitude: {issue.completionProofLocation.longitude}</span>
                    {issue.completionProofLocation.capturedAt && (
                      <span>
                        Captured: {new Date(issue.completionProofLocation.capturedAt).toLocaleString()}
                      </span>
                    )}
                    <span>Source: {issue.completionProofLocation.source}</span>
                    {issue.completionProofLocation.verified === false && (
                      <span className="location-warning">
                        ⚠️{" "}
                        {issue.completionProofLocation.verificationMessage ||
                          "Resolution photo location is outside the original issue location."}
                        {issue.completionProofLocation.distanceMeters != null &&
                          ` (${Math.round(issue.completionProofLocation.distanceMeters)}m away)`}
                      </span>
                    )}
                    {issue.completionProofLocation.verified === true && (
                      <span className="location-verified">✅ Verified near original issue location</span>
                    )}
                  </>
                ) : (
                  <span>Location unavailable for this evidence photo.</span>
                )}
              </div>

              {issue.image && (
                <div className="before-after-grid">
                  <div className="before-after-item">
                    <h3>Before</h3>
                    <img
                      className="issue-image"
                      src={`${apiBase}${issue.image}`}
                      alt="Original reported issue"
                    />
                  </div>
                  <div className="before-after-item">
                    <h3>After</h3>
                    <img
                      className="issue-image"
                      src={`${apiBase}${issue.resolutionEvidence || issue.completionProof}`}
                      alt="Authority resolution evidence"
                    />
                  </div>
                </div>
              )}
            </section>
          )}

          <section className="issue-timeline">
            <h2>Status Timeline</h2>

            {timeline.length === 0 ? (
              <p>No status updates recorded yet.</p>
            ) : (
              <ol className="timeline-list">
                {timeline.map((entry, index) => (
                  <li key={`${entry.status}-${entry.changedAt}-${index}`} className="timeline-item">
                    <div className="timeline-header">
                      <span
                        className={`status status-${entry.status.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        {entry.status}
                      </span>
                      <span className="timeline-date">
                        {new Date(entry.changedAt).toLocaleString()}
                      </span>
                    </div>

                    <p className="timeline-actor">By {resolveUserLabel(entry.changedBy)}</p>

                    {entry.remarks && <p className="timeline-remarks">{entry.remarks}</p>}

                    {entry.completionProof && (
                      <img
                        className="timeline-proof"
                        src={`${apiBase}${entry.completionProof}`}
                        alt="Completion proof"
                      />
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </article>
      </div>
    </main>
  );
}

export default IssueDetail;
