/* eslint-disable react-hooks/set-state-in-effect, react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from "react";
import { loginUser, registerUser } from "../services/authService";
import { AUTH_EXPIRED_EVENT } from "../services/api";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem("token");
    const savedUser = localStorage.getItem("user");

    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      }
    }

    setLoading(false);
  }, []);

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    setToken(null);
    setUser(null);
  };

  // If any protected request comes back 401 (expired/invalid token, or the
  // account no longer exists/is inactive), clear the stale session so
  // ProtectedRoute naturally redirects to /login instead of leaving the
  // user stuck on a dashboard that will just keep failing.
  useEffect(() => {
    const handleAuthExpired = () => logout();
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, []);

  const login = async (credentials) => {
    const data = await loginUser(credentials);

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));

    setToken(data.token);
    setUser(data.user);

    return data;
  };

  const register = async (userData) => {
    const data = await registerUser(userData);

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));

    setToken(data.token);
    setUser(data.user);

    return data;
  };

  const updateUser = (updatedUser) => {
    localStorage.setItem("user", JSON.stringify(updatedUser));
    setUser(updatedUser);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};
