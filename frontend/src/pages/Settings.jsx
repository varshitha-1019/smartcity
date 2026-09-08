import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getProfile, changePassword } from "../services/authService";
import LoadingSpinner from "../components/LoadingSpinner";
import "./Settings.css";

function Settings() {
  const { token, logout } = useAuth();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await getProfile(token);
        setProfile(data.user);
      } catch (err) {
        setLoadError(err.message || "Unable to load account settings.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handlePasswordChange = (e) => {
    setPasswordForm({ ...passwordForm, [e.target.name]: e.target.value });
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();

    if (saving) {
      return;
    }

    setPasswordError("");
    setPasswordSuccess("");

    if (passwordForm.newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    try {
      setSaving(true);
      await changePassword(
        {
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        },
        token
      );

      setPasswordSuccess("Password updated successfully.");
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      setPasswordError(err.message || "Unable to change password.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="settings-page">
        <LoadingSpinner label="Loading settings…" />
      </main>
    );
  }

  return (
    <main className="settings-page">
      <div className="settings-container">
        <h1>Settings</h1>

        {loadError && <div className="error-message">{loadError}</div>}

        <section className="settings-section">
          <h2>Account</h2>

          <div className="settings-readonly-grid">
            <div>
              <label>Name</label>
              <p>{profile?.name}</p>
            </div>

            <div>
              <label>Email</label>
              <p>{profile?.email}</p>
            </div>

            <div>
              <label>Role</label>
              <p>{profile?.role}</p>
            </div>

            {profile?.department && (
              <div>
                <label>Department</label>
                <p>{profile.department}</p>
              </div>
            )}
          </div>

          <p className="settings-hint">
            To change your name, visit your <a href="/profile">Profile</a> page.
          </p>
        </section>

        <section className="settings-section">
          <h2>Security</h2>

          {passwordError && <div className="error-message">{passwordError}</div>}
          {passwordSuccess && <div className="success-message">{passwordSuccess}</div>}

          <form onSubmit={handlePasswordSubmit} className="settings-form">
            <label htmlFor="currentPassword">Current password</label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              value={passwordForm.currentPassword}
              onChange={handlePasswordChange}
              required
            />

            <label htmlFor="newPassword">New password</label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              value={passwordForm.newPassword}
              onChange={handlePasswordChange}
              required
              minLength={6}
            />

            <label htmlFor="confirmPassword">Confirm new password</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={passwordForm.confirmPassword}
              onChange={handlePasswordChange}
              required
              minLength={6}
            />

            <button type="submit" disabled={saving}>
              {saving ? "Updating..." : "Change Password"}
            </button>
          </form>
        </section>

        <section className="settings-section">
          <h2>Session</h2>
          <p className="settings-hint">Sign out of your account on this device.</p>
          <button type="button" className="settings-logout" onClick={logout}>
            Logout
          </button>
        </section>
      </div>
    </main>
  );
}

export default Settings;
