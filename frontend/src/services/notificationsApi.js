import api from "./httpClient";
import { shareInFlight } from "./shareInFlight";

/** Dispatched on `window` after notification-worthy events (e.g. subscription payment) so the bell refetches. */
export const NOTIFICATIONS_REFRESH_EVENT = "orderz-notifications-refresh";

export const listMyNotificationsRequest = async (params = {}) => {
  const { data } = await api.get("/notifications", { params });
  return data;
};

export const getUnreadNotificationsCountRequest = () =>
  // Bell + sidebar badge mount together: one request while it is in flight.
  shareInFlight("notifications:unread-count", async () => (await api.get("/notifications/unread-count")).data);

export const markNotificationReadRequest = async (notificationId) => {
  const { data } = await api.post(`/notifications/${notificationId}/read`);
  return data;
};

export const markAllNotificationsReadRequest = async () => {
  const { data } = await api.post("/notifications/read-all");
  return data;
};

export const deleteNotificationRequest = async (notificationId) => {
  const { data } = await api.delete(`/notifications/${encodeURIComponent(notificationId)}`);
  return data;
};

export const deleteNotificationsBulkRequest = async (ids) => {
  const { data } = await api.post("/notifications/bulk-delete", { ids });
  return data;
};
