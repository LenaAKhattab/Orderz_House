import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useAuth } from "./useAuth";
import { connectNotificationStream } from "../services/notificationRealtime";
import { showBrowserNotification } from "../services/browserNotifications";
import { shouldShowBrowserPush } from "../utils/notificationPreferenceRules";
import { mergeNotificationPrefs } from "../utils/accountDisplay";
import { NOTIFICATIONS_REFRESH_EVENT } from "../services/api";

const NotificationRealtimeContext = createContext(null);

export function NotificationRealtimeProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id;
  const prefs = useMemo(() => mergeNotificationPrefs(user?.notificationPreferences), [user?.notificationPreferences]);
  const browserOk = useMemo(() => {
    const stored = String(user?.browserNotificationStatus || "").toLowerCase();
    return stored === "accepted";
  }, [user?.browserNotificationStatus]);

  const onRealtimePayload = useCallback(
    (payload) => {
      const notification = payload?.notification;
      window.dispatchEvent(
        new CustomEvent(NOTIFICATIONS_REFRESH_EVENT, {
          detail: { notification, unreadDelta: payload?.unreadDelta },
        }),
      );

      if (!browserOk || !notification) return;
      if (!shouldShowBrowserPush(notification, prefs)) return;
      if (typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus()) {
        return;
      }

      showBrowserNotification({
        title: notification.title || "إشعار جديد",
        body: notification.message || "",
        link: notification.link,
        tag: notification.id ? String(notification.id) : undefined,
      });
    },
    [browserOk, prefs],
  );

  const handlerRef = useRef(onRealtimePayload);
  handlerRef.current = onRealtimePayload;

  useEffect(() => {
    if (!userId) return undefined;
    const disconnect = connectNotificationStream({
      onNotification: (p) => handlerRef.current(p),
    });
    return disconnect;
  }, [userId]);

  return <NotificationRealtimeContext.Provider value={{ connected: Boolean(userId) }}>{children}</NotificationRealtimeContext.Provider>;
}

export function useNotificationRealtime() {
  return useContext(NotificationRealtimeContext);
}
