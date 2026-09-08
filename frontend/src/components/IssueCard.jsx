import { Link } from "react-router-dom";
import "./IssueCard.css";

// Reusable summary card for a citizen-reported issue. Used by TrackIssue and
// CitizenDashboard so both surfaces render an issue identically.
function IssueCard({ issue }) {
  return (
    <div className="issue-card">
      <div className="issue-header">
        <h2>{issue.title}</h2>

        <span
          className={`status status-${issue.status
            .toLowerCase()
            .replace(/\s+/g, "-")}`}
        >
          {issue.status}
        </span>
      </div>

      <p>{issue.description}</p>

      <div className="issue-details">
        <span>
          <strong>Category:</strong> {issue.category}
        </span>

        <span>
          <strong>Priority:</strong> {issue.priority}
        </span>

        <span>
          <strong>Address:</strong>{" "}
          {issue.location?.address || "Not provided"}
        </span>
      </div>

      {issue.remarks && (
        <p className="latest-remarks">
          <strong>Latest update:</strong> {issue.remarks}
        </p>
      )}

      {issue.completionProof && (
        <p className="proof-available">Completion proof uploaded ✓</p>
      )}

      <Link to={`/issues/${issue._id}`}>View complete details</Link>

      <small>
        Reported on{" "}
        {new Date(issue.createdAt).toLocaleDateString()}
      </small>
    </div>
  );
}

export default IssueCard;
