import { apiRequest } from "./api";

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

export const listAuthorities = async (token) => {
  return apiRequest("/admin/authorities", {
    headers: authHeader(token),
  });
};

export const createAuthority = async (payload, token) => {
  return apiRequest("/admin/authorities", {
    method: "POST",
    headers: authHeader(token),
    body: JSON.stringify(payload),
  });
};

export const updateAuthorityStatus = async (authorityId, active, token) => {
  return apiRequest(`/admin/authorities/${authorityId}/status`, {
    method: "PATCH",
    headers: authHeader(token),
    body: JSON.stringify({ active }),
  });
};

export const updateAuthority = async (authorityId, payload, token) => {
  return apiRequest(`/admin/authorities/${authorityId}`, {
    method: "PATCH",
    headers: authHeader(token),
    body: JSON.stringify(payload),
  });
};

export const deleteAuthority = async (authorityId, token) => {
  return apiRequest(`/admin/authorities/${authorityId}`, {
    method: "DELETE",
    headers: authHeader(token),
  });
};
