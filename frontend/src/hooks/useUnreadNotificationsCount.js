import { useCallback, useEffect, useState } from "react";
import { getUnreadNotificationsCountRequest, NOTIFICATIONS_REFRESH_EVENT } from "../services/api";

export default function useUnreadNotificationsCount(enabled = true) {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await getUnreadNotificationsCountRequest();
      setCount(Number(res?.data?.unreadCount || 0));
    } catch {
      /* keep previous */
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    void fetchCount();
    const t = setInterval(fetchCount, 30_000);
    const onRefresh = (e) => {
      const delta = e?.detail?.unreadDelta;
      if (typeof delta === "number") {
        setCount((c) => Math.max(0, c + delta));
      } else {
        void fetchCount();
      }
    };
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
    return () => {
      clearInterval(t);
      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
    };
  }, [enabled, fetchCount]);

  return { count, refresh: fetchCount };
}
