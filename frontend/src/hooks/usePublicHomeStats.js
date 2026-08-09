import { useEffect, useRef, useState } from "react";
import { getPublicHomeStatsRequest } from "../services/api";
import { setPublicHomeStatsRefetchListener, peekLatestVisitorsTotal, peekLatestActiveUsersTotal } from "../services/publicHomeStatsRefetch";

export { formatHomePublicStat } from "../utils/homePublicStatFormat";

/** Poll while homepage tab is visible (ms). Align with backend order-stats cache TTL. */
const PUBLIC_HOME_STATS_POLL_MS = Math.min(
  Math.max(Number(import.meta.env.VITE_PUBLIC_HOME_STATS_POLL_MS) || 20_000, 15_000),
  30_000,
);

/**
 * Homepage public stats helpers — see usePublicHomeStats below.
 */

function toStatInt(v) {
  if (v == null || Number.isNaN(Number(v))) return null;
  return Math.trunc(Number(v));
}

/** Pageview total is monotonic — never regress from stale poll/cache. */
function mergeMonotonicVisitors(prev, next) {
  if (!next.showVisitorsCount) return next;
  const p = toStatInt(prev?.visitors);
  const n = toStatInt(next.visitors);
  if (p == null || n == null) return next;
  if (n < p) {
    return { ...next, visitors: p };
  }
  return next;
}

/** Keep last good values on poll; accept backend decreases for order counts & active users. */
function mergePolledHeroStats(prev, next) {
  if (!prev || prev.error) return next;
  let merged = { ...next, error: false };
  merged = mergeMonotonicVisitors(prev, merged);
  return merged;
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
    availableOrdersNow: d?.availableOrdersNow,
    completedOrders: d?.completedOrders,
    trainingRotationsCompleted: d?.trainingRotationsCompleted,
    orderCountsDegraded: Boolean(d?.orderCountsDegraded),
  };
}

function mergeInstantPatch(prev, instant) {
  const instantVisitors = instant?.visitors;
  const instantActive = instant?.activeUsers;
  if (instantVisitors == null && instantActive == null) return prev;

  const next = {
    ...(prev ?? { error: false }),
    error: false,
  };

  if (instantVisitors != null) {
    const prevV = toStatInt(prev?.visitors);
    const nextV = toStatInt(instantVisitors);
    next.visitors = prevV != null && nextV != null ? Math.max(prevV, nextV) : nextV;
    next.visitorsReason = (next.visitors ?? 0) > 0 ? "ok" : "zero_traffic";
    if (prev == null || prev.showVisitorsCount == null) next.showVisitorsCount = true;
  }

  if (instantActive != null) {
    next.activeUsers = toStatInt(instantActive);
    next.activeUsersReason = (next.activeUsers ?? 0) > 0 ? "ok" : "zero_traffic";
    if (prev == null || prev.showActiveUsersCount == null) next.showActiveUsersCount = true;
  }

  return next;
}

function isAbortError(err) {
  return err?.name === "CanceledError" || err?.code === "ERR_CANCELED";
}

/**
 * Homepage public stats: local DB pageviews + active users (7d), plus DB order counts.
 * Instant pageview bump via publicHomeStatsRefetch; polls ~20s while tab is visible.
 */
export function usePublicHomeStats() {
  const [payload, setPayload] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const lastGoodRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId = null;
    let abortController = null;

    const applyPayload = (next) => {
      lastGoodRef.current = next;
      setPayload(next);
    };

    const load = async () => {
      if (cancelled || (typeof document !== "undefined" && document.visibilityState === "hidden")) {
        return;
      }

      abortController?.abort();
      abortController = new AbortController();

      try {
        const res = await getPublicHomeStatsRequest({ signal: abortController.signal });
        const d = res?.data;
        if (cancelled) return;

        const cachedVisitors = peekLatestVisitorsTotal();
        const cachedActive = peekLatestActiveUsersTotal();
        let next = {
          ...mapHomeStats(d),
          error: false,
          ...(cachedVisitors != null && d?.showVisitorsCount
            ? { visitors: cachedVisitors, visitorsReason: cachedVisitors > 0 ? "ok" : "zero_traffic" }
            : {}),
          ...(cachedActive != null && d?.showActiveUsersCount
            ? { activeUsers: cachedActive, activeUsersReason: cachedActive > 0 ? "ok" : "zero_traffic" }
            : {}),
        };
        if (lastGoodRef.current) {
          next = mergePolledHeroStats(lastGoodRef.current, next);
        }
        applyPayload(next);
      } catch (e) {
        if (cancelled || isAbortError(e)) return;
        if (import.meta.env.DEV) console.warn("[usePublicHomeStats] request failed", e);
        if (lastGoodRef.current) return;
        applyPayload({ error: true, ...mapHomeStats({}) });
      } finally {
        if (!cancelled) setIsReady(true);
      }
    };

    const schedulePoll = () => {
      if (intervalId) window.clearInterval(intervalId);
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        intervalId = null;
        return;
      }
      intervalId = window.setInterval(() => void load(), PUBLIC_HOME_STATS_POLL_MS);
    };

    const onVisibilityChange = () => {
      if (cancelled) return;
      if (document.visibilityState === "visible") {
        void load();
        schedulePoll();
      } else {
        if (intervalId) window.clearInterval(intervalId);
        intervalId = null;
        abortController?.abort();
      }
    };

    setPublicHomeStatsRefetchListener((instant) => {
      if (cancelled) return;
      if (instant?.visitors == null && instant?.activeUsers == null) {
        void load();
        return;
      }
      setPayload((prev) => {
        const patched = mergeInstantPatch(prev, instant);
        lastGoodRef.current = patched;
        return patched;
      });
      void load();
    });

    void load();
    schedulePoll();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      setPublicHomeStatsRefetchListener(null);
      if (intervalId) window.clearInterval(intervalId);
      abortController?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return { payload, isReady };
}
