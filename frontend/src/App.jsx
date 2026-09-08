import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";

import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import SplashScreen from "./components/SplashScreen";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ReportIssue from "./pages/ReportIssue";
import TrackIssue from "./pages/TrackIssue";
import CitizenDashboard from "./pages/CitizenDashboard";
import AuthorityDashboard from "./pages/AuthorityDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import IssueDetail from "./pages/IssueDetail";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import Notifications from "./pages/Notifications";
import Contact from "./pages/Contact";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";

// How long the splash screen stays fully visible before it starts fading
// out. This only ever runs once per full page load (App only mounts once
// per load), so no persisted "have we shown this before" flag is needed -
// see the comment in SplashScreen.jsx.
const SPLASH_VISIBLE_MS = 2200;
const SPLASH_FADE_MS = 450;

function App() {
  const [splashPhase, setSplashPhase] = useState("visible"); // visible -> fading -> done

  useEffect(() => {
    const fadeTimer = setTimeout(() => setSplashPhase("fading"), SPLASH_VISIBLE_MS);
    const doneTimer = setTimeout(() => setSplashPhase("done"), SPLASH_VISIBLE_MS + SPLASH_FADE_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          {/* The real app renders underneath the splash the whole time so
              routing/auth resolve in the background - when the splash
              fades out the correct authenticated/unauthenticated page is
              already in place, with no flash of the wrong page. */}
          <div className={`app-shell${splashPhase === "done" ? " app-shell--in" : ""}`}>
            <Navbar />

            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />}
               />
                <Route path="/report-issue" element={<ProtectedRoute roles={["citizen"]}><ReportIssue /></ProtectedRoute>} />
                <Route path="/track-issue" element={<ProtectedRoute roles={["citizen"]}><TrackIssue /></ProtectedRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute roles={["citizen"]}><CitizenDashboard /></ProtectedRoute>} />
                <Route path="/issues/:id" element={<ProtectedRoute><IssueDetail /></ProtectedRoute>} />
                <Route path="/authority" element={<ProtectedRoute roles={["authority"]}><AuthorityDashboard /></ProtectedRoute>} />
                <Route path="/admin" element={<ProtectedRoute roles={["administrator"]}><AdminDashboard /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
                <Route path="/contact" element={<Contact />} />

              <Route path="*" element={<NotFound />} />
            </Routes>

            <Footer />
          </div>

          {splashPhase !== "done" && <SplashScreen fadingOut={splashPhase === "fading"} />}
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
