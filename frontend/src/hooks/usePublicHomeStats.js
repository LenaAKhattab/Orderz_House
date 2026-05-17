import { useEffect, useRef, useState } from "react";
import { getPublicHomeStatsRequest } from "../services/api";

/** Polling interval for public home stats (ms). */
const PUBLIC_HOME_STATS_POLL_MS = 12_000;

export function formatHomePublicStat(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("en-US").format(Math.trunc(Number(n)));
}

function mapHomeStats(d) {
  return {
    showVisitorsCount: Boolean(d?.showVisitorsCount),
    showActiveUsersCount: Boolean(d?.showActiveUsersCount),
    visitors: d?.visitors,
    activeUsers: d?.activeUsers,
    visitorsReason: d?.visitorsReason || null,
    activeUsersReason: d?.activeUsersReason || null,
    analyticsDegraded: Boolean(d?.analyticsDegraded),
    analyticsMisconfigured: Boolean(d?.analyticsMisconfigured),
    analyticsQueriedAt: d?.analyticsQueriedAt || null,
    analyticsLastPageviewAt: d?.analyticsLastPageviewAt || null,
    openProjects: d?.openProjects,
    inProgressProjects: d?.inProgressProjects,
    completedProjects: d?.completedProjects,
    orderCountsDegraded: Boolean(d?.orderCountsDegraded),
  };
}

/**
 * Homepage public stats: PostHog-backed toggles when enabled, plus DB order pipeline counts.
 * Polls on an interval; keeps the last successful payload on transient poll failures.
 */
export function usePublicHomeStats() {
  const [payload, setPayload] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const lastGoodRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId;

    const load = async () => {
      try {
        const res = await getPublicHomeStatsRequest();
        const d = res?.data;
        if (cancelled) return;
        const next = { ...mapHomeStats(d), error: false };
        lastGoodRef.current = next;
        setPayload(next);
      } catch (e) {
        if (cancelled) return;
        if (import.meta.env.DEV) console.warn("[usePublicHomeStats] request failed", e);
        if (lastGoodRef.current) {
          return;
        }
        setPayload({ error: true, ...mapHomeStats({}) });
      } finally {
        if (!cancelled) setIsReady(true);
      }
    };

    load();
    intervalId = window.setInterval(() => load(), PUBLIC_HOME_STATS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return { payload, isReady };
}
