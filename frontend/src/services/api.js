const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

// Fired whenever a protected request comes back 401 (invalid/expired token,
// or the user no longer exists/is inactive) so AuthContext can clear the
// stale session and ProtectedRoute can redirect to /login. Login/register
// requests are excluded below since a 401 there just means "wrong
// credentials", not "your session is invalid" - there's no session yet.
export const AUTH_EXPIRED_EVENT = "auth:expired";

export const apiRequest = async (endpoint, options = {}) => {
  const isFormData = options.body instanceof FormData;
  const headers = { ...(options.headers || {}) };
  if (!isFormData && options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401 && !endpoint.startsWith("/auth/")) {
        window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
      }

      const error = new Error(data.message || "Something went wrong");
      error.status = response.status;
      // Full JSON body, so callers that need extra structured fields (e.g.
      // the AI rejection contract's aiStatus/isRelevant/reason - see
      // issueController.createIssue) can read them without every other
      // caller needing to change; existing code that only reads
      // error.message/error.status is unaffected.
      error.data = data;
      throw error;
    }

    return data;
  } catch (error) {
    if (error instanceof Error && error.message && error.message !== "Something went wrong") {
      throw error;
    }

    const fallbackError = new Error("Unable to reach the server. Please ensure the backend is running.");
    fallbackError.cause = error;
    throw fallbackError;
  }
};

export default API_URL;
