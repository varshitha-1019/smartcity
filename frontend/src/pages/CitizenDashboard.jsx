import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getMyIssues } from "../services/issueService";
import IssueCard from "../components/IssueCard";
import LoadingSpinner from "../components/LoadingSpinner";
import "./Dashboard.css";
import "./TrackIssue.css";

const STATUS_FILTERS = ["All", "Pending", "Assigned", "In Progress", "Resolved", "Rejected"];

function CitizenDashboard() {
  const { token } = useAuth();

  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  useEffect(() => {
    (async () => {
      try {
        const data = await getMyIssues(token);
        setIssues(data.issues || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <main className="dashboard-page">
        <LoadingSpinner label="Loading your dashboard…" />
      </main>
    );
  }

  const stats = {
    total: issues.length,
    pending: issues.filter((issue) => issue.status === "Pending").length,
    inProgress: issues.filter((issue) => issue.status === "In Progress" || issue.status === "Assigned").length,
    resolved: issues.filter((issue) => issue.status === "Resolved").length,
  };

  const filteredIssues = issues.filter((issue) => {
    const matchesSearch = (issue.title + " " + issue.category + " " + issue.assignedDepartment)
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesStatus = statusFilter === "All" || issue.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <main className="dashboard-page">
      <div className="dashboard-container">
        <h1>My Dashboard</h1>

        {error && <div className="error-message">{error}</div>}

        <div className="stats-grid">
          <div className="stat-card">
            <h2>{stats.total}</h2>
            <p>Total Reports</p>
          </div>

          <div className="stat-card">
            <h2>{stats.pending}</h2>
            <p>Pending</p>
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

        <section className="dashboard-section">
          <h2>My Reported Issues</h2>

          <div className="dashboard-filters">
            <input
              type="text"
              placeholder="Search by title, category, or department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUS_FILTERS.map((status) => (
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
            <div className="issue-list">
              {filteredIssues.map((issue) => (
                <IssueCard issue={issue} key={issue._id} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default CitizenDashboard;
