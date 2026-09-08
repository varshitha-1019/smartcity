import { apiRequest } from "./api";

export const getNotifications = async (token) => {
  return apiRequest("/dashboard/notifications", {
    headers: { Authorization: `Bearer ${token}` },
  });
};
