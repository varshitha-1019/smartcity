import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getProfile, updateProfile } from "../services/authService";
import LoadingSpinner from "../components/LoadingSpinner";
import "./Profile.css";

function Profile() {
  const { token, user, updateUser } = useAuth();

  const [profile, setProfile] = useState(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await getProfile(token);
        setProfile(data.user);
        setName(data.user.name || "");
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (name.trim().length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }

    try {
      setSaving(true);
      const data = await updateProfile({ name: name.trim() }, token);
      setProfile(data.user);
      setSuccess("Profile updated successfully.");

      // Keep the cached user (used by Navbar, ProtectedRoute, etc.) in sync.
      updateUser({ ...user, name: data.user.name });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="profile-page">
        <LoadingSpinner label="Loading profile…" />
      </main>
    );
  }

  return (
    <main className="profile-page">
      <div className="profile-container">
        <h1>My Profile</h1>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <form onSubmit={handleSubmit} className="profile-form">
          <label htmlFor="profile-name">Name</label>
          <input
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <label htmlFor="profile-email">Email</label>
          <input id="profile-email" type="email" value={profile?.email || ""} disabled />

          <label htmlFor="profile-role">Role</label>
          <input id="profile-role" type="text" value={profile?.role || ""} disabled />

          {profile?.department && (
            <>
              <label htmlFor="profile-department">Department</label>
              <input id="profile-department" type="text" value={profile.department} disabled />
            </>
          )}

          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default Profile;
