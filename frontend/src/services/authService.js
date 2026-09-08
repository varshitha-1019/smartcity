import { apiRequest } from "./api";

export const registerUser = async (userData) => {
  return apiRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify(userData),
  });
};

export const loginUser = async (credentials) => {
  return apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
};

export const getProfile = async (token) => {
  return apiRequest("/users/profile", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const updateProfile = async (updates, token) => {
  return apiRequest("/users/profile", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(updates),
  });
};

export const changePassword = async ({ currentPassword, newPassword }, token) => {
  return apiRequest("/users/password", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
};