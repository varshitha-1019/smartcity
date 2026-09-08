import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getAllIssues, getDashboardStats, updateIssueStatus } from "../services/issueService";
import {
  listAuthorities,
  createAuthority,
  updateAuthority,
  updateAuthorityStatus,
  deleteAuthority,
} from "../services/adminService";
import LoadingSpinner from "../components/LoadingSpinner";
import "./Dashboard.css";

const AUTHORITY_DOMAINS = ["Garbage", "Drainage", "Water Leakage", "Pothole"];

const STATUS_FILTERS = ["All", "Pending", "Assigned", "In Progress", "Resolved", "Rejected"];

export default function AdminDashboard() {
  const { token } = useAuth();

  const [stats, setStats] = useState(null);
  const [issues, setIssues] = useState([]);
  const [authorities, setAuthorities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [departmentFilter, setDepartmentFilter] = useState("All");

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    department: "Pothole",
    active: true,
  });
  const [formError, setFormError] = useState("");

  const [actionMessage, setActionMessage] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", department: "Pothole", password: "" });
  const [editError, setEditError] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const [issueActionMessage, setIssueActionMessage] = useState("");
  const [issueActionError, setIssueActionError] = useState("");
  const [updatingIssueId, setUpdatingIssueId] = useState(null);

  // Bumping reloadIndex re-runs the effect below, giving callers (form
  // submit, status toggle) a way to trigger a refresh without calling an
  // external async function from inside the effect.
  const [reloadIndex, setReloadIndex] = useState(0);
  const refreshDashboard = () => setReloadIndex((n) => n + 1);

  const handleUpdateIssueStatus = async (issueId, newStatus, customRemarks) => {
    try {
      setUpdatingIssueId(issueId);
      setIssueActionError("");
      const resolvedStatus = newStatus === "Completed" ? "Resolved" : newStatus;
      await updateIssueStatus(
        issueId,
        {
          status: resolvedStatus,
          remarks: customRemarks || `Status marked as ${resolvedStatus} by Administrator`,
        },
        token
      );
      setIssueActionMessage(`Issue status successfully updated to ${resolvedStatus}.`);
      refreshDashboard();
      setTimeout(() => setIssueActionMessage(""), 5000);
    } catch (err) {
      setIssueActionError(err.message || "Failed to update issue status.");
      setTimeout(() => setIssueActionError(""), 6000);
    } finally {
      setUpdatingIssueId(null);
    }
  };

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    let ignore = false;

    (async () => {
      try {
        setError("");

        const [dashboard, issueData, authorityData] = await Promise.all([
          getDashboardStats(token),
          getAllIssues(token),
          listAuthorities(token),
        ]);

        if (ignore) return;

        setStats(dashboard);
        setIssues(issueData.issues || []);
        setAuthorities(authorityData.authorities || []);
      } catch (err) {
        if (!ignore) {
          setError(err.message || "Unable to load dashboard data.");
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

  const handleChange = (e) => {
    const { name, type, checked, value } = e.target;
    setForm({
      ...form,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const handleCreateAuthority = async (e) => {
    e.preventDefault();

    try {
      setFormError("");
      await createAuthority(form, token);

      setForm({
        name: "",
        email: "",
        password: "",
        department: "Pothole",
        active: true,
      });

      setActionMessage(`${form.name} was created.`);
      refreshDashboard();
    } catch (err) {
      setFormError(err.message || "Unable to create authority.");
    }
  };

  const toggleAuthority = async (authority) => {
    try {
      await updateAuthorityStatus(authority._id || authority.id, !authority.active, token);
      setActionMessage(`${authority.name} is now ${authority.active ? "inactive" : "active"}.`);
      refreshDashboard();
    } catch (err) {
      setError(err.message || "Unable to update authority status.");
    }
  };

  const startEditAuthority = (authority) => {
    setEditingId(authority._id || authority.id);
    setEditForm({
      name: authority.name || "",
      email: authority.email || "",
      department: authority.department || "Pothole",
      password: "",
    });
    setEditError("");
  };

  const cancelEditAuthority = () => {
    setEditingId(null);
    setEditError("");
  };

  const handleEditChange = (e) => {
    setEditForm({ ...editForm, [e.target.name]: e.target.value });
  };

  const submitEditAuthority = async (e, authority) => {
    e.preventDefault();
    setEditSubmitting(true);
    setEditError("");
    try {
      const payload = {
        name: editForm.name,
        email: editForm.email,
        department: editForm.department,
      };
      if (editForm.password) payload.password = editForm.password;

      await updateAuthority(authority._id || authority.id, payload, token);
      setActionMessage(`${editForm.name} was updated.`);
      setEditingId(null);
      refreshDashboard();
    } catch (err) {
      setEditError(err.message || "Unable to update authority.");
    } finally {
      setEditSubmitting(false);
    }
  };

  const requestDeleteAuthority = (authority) => {
    setConfirmDeleteId(authority._id || authority.id);
  };

  const cancelDeleteAuthority = () => setConfirmDeleteId(null);

  const confirmDeleteAuthority = async (authority) => {
    const id = authority._id || authority.id;
    setDeletingId(id);
    try {
      await deleteAuthority(id, token);
      setActionMessage(`${authority.name} was deleted.`);
      setConfirmDeleteId(null);
      refreshDashboard();
    } catch (err) {
      setError(err.message || "Unable to delete authority.");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredIssues = issues.filter((issue) => {
    const matchesSearch = (
      issue.title +
      " " +
      issue.category +
      " " +
      issue.assignedDepartment +
      " " +
      (issue.reportedBy?.name || "")
    )
      .toLowerCase()
      .includes(search.toLowerCase());

    const matchesStatus = statusFilter === "All" || issue.status === statusFilter;
    const matchesDepartment = departmentFilter === "All" || issue.assignedDepartment === departmentFilter;

    return matchesSearch && matchesStatus && matchesDepartment;
  });

  if (loading) {
    return (
      <main className="dashboard-page">
        <LoadingSpinner label="Loading admin dashboard…" />
      </main>
    );
  }

  return (
    <main className="dashboard-page">
      <div className="dashboard-container">

        <h1>Administrator Dashboard</h1>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {stats && (
          <div className="stats-grid">

            <div className="stat-card">
              <h2>{stats.totalUsers}</h2>
              <p>Total Users</p>
            </div>

            <div className="stat-card">
              <h2>{stats.citizens}</h2>
              <p>Citizens</p>
            </div>

            <div className="stat-card">
              <h2>{stats.authorities}</h2>
              <p>Authorities</p>
            </div>

            <div className="stat-card">
              <h2>{stats.totalIssues}</h2>
              <p>Total Issues</p>
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

            <div className="stat-card">
              <h2>{stats.rejected}</h2>
              <p>Rejected</p>
            </div>

          </div>
        )}

        <section className="dashboard-section">

          <h2>Create Authority</h2>

          {formError && <div className="error-message">{formError}</div>}

          <form onSubmit={handleCreateAuthority}>

            <input
              type="text"
              name="name"
              placeholder="Authority Name"
              value={form.name}
              onChange={handleChange}
              required
            />

            <input
              type="email"
              name="email"
              placeholder="Email"
              value={form.email}
              onChange={handleChange}
              required
            />

            <input
              type="password"
              name="password"
              placeholder="Password (min. 6 characters)"
              value={form.password}
              onChange={handleChange}
              required
            />

            <select
              name="department"
              value={form.department}
              onChange={handleChange}
            >
              {AUTHORITY_DOMAINS.map((dept) => (
                <option
                  key={dept}
                  value={dept}
                >
                  {dept}
                </option>
              ))}
            </select>

            <label className="checkbox-field">
              <input
                type="checkbox"
                name="active"
                checked={form.active}
                onChange={handleChange}
              />
              Active immediately
            </label>

            <button type="submit">
              Create Authority
            </button>

          </form>

        </section>

        <section className="dashboard-section">

          <h2>Authorities</h2>

          {actionMessage && (
            <div className="success-message">{actionMessage}</div>
          )}

          {authorities.length === 0 ? (
            <div className="empty-state">
              <h2>No authorities yet</h2>
              <p>Create one above to start assigning issues.</p>
            </div>
          ) : (
            <table className="dashboard-table">

              <thead>

                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Assigned Issues</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>

              </thead>

              <tbody>

                {authorities.map((authority) => {
                  const authorityId = authority._id || authority.id;
                  const isEditing = editingId === authorityId;
                  const isConfirmingDelete = confirmDeleteId === authorityId;

                  if (isEditing) {
                    return (
                      <tr key={authorityId}>
                        <td colSpan={6}>
                          <form
                            className="inline-edit-form"
                            onSubmit={(e) => submitEditAuthority(e, authority)}
                          >
                            {editError && <div className="error-message">{editError}</div>}

                            <input
                              type="text"
                              name="name"
                              value={editForm.name}
                              onChange={handleEditChange}
                              placeholder="Name"
                              required
                            />

                            <input
                              type="email"
                              name="email"
                              value={editForm.email}
                              onChange={handleEditChange}
                              placeholder="Email"
                              required
                            />

                            <select
                              name="department"
                              value={editForm.department}
                              onChange={handleEditChange}
                            >
                              {AUTHORITY_DOMAINS.map((dept) => (
                                <option key={dept} value={dept}>
                                  {dept}
                                </option>
                              ))}
                            </select>

                            <input
                              type="password"
                              name="password"
                              value={editForm.password}
                              onChange={handleEditChange}
                              placeholder="New password (leave blank to keep current)"
                            />

                            <button type="submit" disabled={editSubmitting}>
                              {editSubmitting ? "Saving…" : "Save"}
                            </button>

                            <button type="button" onClick={cancelEditAuthority} disabled={editSubmitting}>
                              Cancel
                            </button>
                          </form>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={authorityId}>

                      <td>{authority.name}</td>

                      <td>{authority.email}</td>

                      <td>{authority.department}</td>

                      <td>{authority.assignedIssueCount ?? "-"}</td>

                      <td>
                        {authority.active ? "Active" : "Inactive"}
                      </td>

                      <td className="table-actions">

                        <button
                          onClick={() => toggleAuthority(authority)}
                        >
                          {authority.active
                            ? "Deactivate"
                            : "Activate"}
                        </button>

                        <button onClick={() => startEditAuthority(authority)}>
                          Edit
                        </button>

                        {isConfirmingDelete ? (
                          <span className="confirm-delete">
                            <span>Delete {authority.name}?</span>
                            <button
                              onClick={() => confirmDeleteAuthority(authority)}
                              disabled={deletingId === authorityId}
                            >
                              {deletingId === authorityId ? "Deleting…" : "Yes, delete"}
                            </button>
                            <button onClick={cancelDeleteAuthority} disabled={deletingId === authorityId}>
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button className="danger" onClick={() => requestDeleteAuthority(authority)}>
                            Delete
                          </button>
                        )}

                      </td>

                    </tr>
                  );
                })}

              </tbody>

            </table>
          )}

        </section>

        <section className="dashboard-section">

          <h2>All Issues</h2>

          {issueActionMessage && (
            <div className="success-message" style={{ marginBottom: "12px" }}>{issueActionMessage}</div>
          )}
          {issueActionError && (
            <div className="error-message" style={{ marginBottom: "12px" }}>{issueActionError}</div>
          )}

          <div className="dashboard-filters">
            <input
              type="text"
              placeholder="Search by title, category, department, or citizen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUS_FILTERS.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>

            <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
              <option>All</option>
              {AUTHORITY_DOMAINS.map((dept) => (
                <option key={dept}>{dept}</option>
              ))}
            </select>
          </div>

          {filteredIssues.length === 0 ? (
            <div className="empty-state">
              <h2>No matching issues</h2>
              <p>Try adjusting your search or filters.</p>
            </div>
          ) : (
            <table className="dashboard-table">

              <thead>

                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Citizen</th>
                  <th>Location</th>
                  <th>Department</th>
                  <th>Assigned To</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Admin Action</th>
                </tr>

              </thead>

              <tbody>

                {filteredIssues.map((issue) => (

                  <tr key={issue._id}>

                    <td>
                      <Link to={`/issues/${issue._id}`}>{issue.title}</Link>
                    </td>

                    <td>{issue.category}</td>

                    <td>{issue.reportedBy?.name || "Unknown"}</td>

                    <td>{issue.location?.address || "-"}</td>

                    <td>{issue.assignedDepartment}</td>

                    <td>{issue.assignedTo?.name || "Unassigned"}</td>

                    <td>{issue.priority}</td>

                    <td>
                      <span className={`status status-${(issue.status || "").toLowerCase().replace(/\s+/g, "-")}`}>
                        {issue.status}
                      </span>
                    </td>

                    <td>{new Date(issue.createdAt).toLocaleDateString()}</td>

                    <td className="table-actions">
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <select
                          className="status-select"
                          value={issue.status}
                          disabled={updatingIssueId === issue._id}
                          onChange={(e) => handleUpdateIssueStatus(issue._id, e.target.value)}
                          style={{ padding: "4px 8px", borderRadius: "6px", fontSize: "12px", border: "1px solid var(--border-color, #ccc)" }}
                        >
                          <option value="Pending">Pending</option>
                          <option value="Assigned">Assigned</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Resolved">Completed (Resolved)</option>
                          <option value="Rejected">Rejected</option>
                        </select>

                        {issue.status !== "Resolved" && (
                          <button
                            type="button"
                            disabled={updatingIssueId === issue._id}
                            onClick={() => handleUpdateIssueStatus(issue._id, "Resolved", "Marked Completed by Administrator")}
                            style={{
                              padding: "4px 8px",
                              fontSize: "12px",
                              backgroundColor: "#16a34a",
                              color: "#fff",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {updatingIssueId === issue._id ? "Saving..." : "✓ Mark Completed"}
                          </button>
                        )}
                      </div>
                    </td>

                  </tr>

                ))}

              </tbody>

            </table>
          )}

        </section>

      </div>
    </main>
  );
}
