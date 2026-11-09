import { useEffect, useRef, useState } from "react";
import { getAdminExternalOrderIntakesPendingCountRequest } from "../services/api";
import { EXTERNAL_INTAKES_CHANGED_EVENT } from "../constants/externalOrderIntakes";

/** Gentle cadence: one indexed COUNT every 2 minutes, only while the tab is visible. */
const REFRESH_MS = 120_000;

/**
 * Pending WhatsApp-order intakes for the staff sidebar badge.
 * No per-submission notifications exist for Admins (avoids fan-out), so the badge is the signal.
 * @param {boolean} enabled — only for staff who can open the queue
 */
export default function useExternalIntakePendingCount(enabled) {
  const [count, setCount] = useState(0);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      if (inFlight.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      inFlight.current = true;
      try {
        const res = await getAdminExternalOrderIntakesPendingCountRequest();
        if (!cancelled) setCount(Math.max(0, Number(res?.data?.pendingCount) || 0));
      } catch {
        /* badge is best-effort; keep the last value */
      } finally {
        inFlight.current = false;
      }
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener(EXTERNAL_INTAKES_CHANGED_EVENT, load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(EXTERNAL_INTAKES_CHANGED_EVENT, load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);

  return count;
}
