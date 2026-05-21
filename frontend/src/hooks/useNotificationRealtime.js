import { useContext } from "react";
import { NotificationRealtimeContext } from "../context/notificationRealtimeContext";

export function useNotificationRealtime() {
  return useContext(NotificationRealtimeContext);
}
