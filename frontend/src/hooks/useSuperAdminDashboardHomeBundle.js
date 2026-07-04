import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getSuperadminDashboardHomeFastRequest,
  getSuperadminDashboardHomeIntelligenceRequest,
  getSuperadminDashboardExecutiveKpisRequest,
  getSuperadminVisitorsAnalyticsRequest,
} from "../services/api";

const REFRESH_MS = 90_000;
const DEV_TIMING = import.meta.env.DEV;

function devLog(...args) {
  if (DEV_TIMING) console.debug("[superadmin-dashboard]", ...args);
}

function mapError(e) {
  const code = e?.code || "";
  const message = String(e?.message || "");
  if (code === "ERR_CANCELED" || code === "CanceledError") {
    return { canceled: true, message: "" };
  }
  if (code === "ECONNABORTED" || /timeout/i.test(message)) {
    return { canceled: false, message: "استغرق تحميل لوحة التحكم وقتًا أطول من المتوقع." };
  }
  return {
    canceled: false,
    message: e?.response?.data?.message || message || "تعذر تحميل لوحة التحكم.",
  };
}

function mergeDashboardParts(fast, executive, intelligence, posthog) {
  if (!fast && !executive && !intelligence && !posthog) return null;

  const sectionErrors = {
    ...(fast?.meta?.sectionErrors || {}),
    ...(executive?.meta?.sectionErrors || {}),
    ...(intelligence?.meta?.sectionErrors || {}),
  };

  return {
    updatedAt: intelligence?.updatedAt || executive?.updatedAt || fast?.updatedAt || posthog?.updatedAt,
    summary: fast?.summary,
    businessKpis: fast?.businessKpis,
    paidSubscriptions: fast?.paidSubscriptions || null,
    posthog: posthog || null,
    intelligence: {
      ...(intelligence?.intelligence || {}),
      executiveKpis: executive?.intelligence?.executiveKpis,
      attention: fast?.intelligence?.attention,
    },
    meta: {
      ...(Object.keys(sectionErrors).length ? { sectionErrors } : {}),
      posthogConfigured: posthog?.meta?.posthogConfigured,
      posthogError: posthog?.meta?.posthogError ?? null,
      period: {
        posthogRange:
          intelligence?.meta?.period?.posthogRange || posthog?.range || "7d",
      },
    },
  };
}

async function trackRequest(label, fn) {
  const start = performance.now();
  devLog(`${label} start`);
  try {
    const result = await fn();
    devLog(`${label} end`, { durationMs: Math.round(performance.now() - start) });
    return result;
  } catch (e) {
    devLog(`${label} error`, {
      durationMs: Math.round(performance.now() - start),
      message: e?.message,
    });
    throw e;
  }
}

/**
 * Phased Super Admin home: home-fast only blocks first paint; executive/PostHog/intelligence are deferred.
 * @param {{ posthogRange?: string, cacheKey?: string } | null} periodQuery
 */
export function useSuperAdminDashboardHomeBundle(periodQuery = null) {
  const [fastData, setFastData] = useState(null);
  const [executiveData, setExecutiveData] = useState(null);
  const [intelligenceData, setIntelligenceData] = useState(null);
  const [posthogData, setPosthogData] = useState(null);

  const [fastLoading, setFastLoading] = useState(true);
  const [executiveLoading, setExecutiveLoading] = useState(false);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [posthogLoading, setPosthogLoading] = useState(false);

  const [fastError, setFastError] = useState("");
  const [executiveError, setExecutiveError] = useState("");
  const [intelligenceError, setIntelligenceError] = useState("");
  const [posthogError, setPosthogError] = useState("");

  const fastRef = useRef(null);
  const executiveRef = useRef(null);
  const intelligenceRef = useRef(null);
  const posthogRef = useRef(null);

  const fastGenRef = useRef(0);
  const executiveGenRef = useRef(0);
  const intelligenceGenRef = useRef(0);
  const posthogGenRef = useRef(0);

  const intelligenceRequestedRef = useRef(false);
  const posthogRequestedRef = useRef(false);
  const executiveRequestedRef = useRef(false);
  const fastAbortRef = useRef(null);
  const executiveAbortRef = useRef(null);
  const intelligenceAbortRef = useRef(null);
  const posthogAbortRef = useRef(null);

  const rangeKey = periodQuery?.cacheKey || periodQuery?.posthogRange || "7d";
  const posthogRange = periodQuery?.posthogRange || "7d";

  useEffect(() => {
    fastRef.current = fastData;
  }, [fastData]);
  useEffect(() => {
    executiveRef.current = executiveData;
  }, [executiveData]);
  useEffect(() => {
    intelligenceRef.current = intelligenceData;
  }, [intelligenceData]);
  useEffect(() => {
    posthogRef.current = posthogData;
  }, [posthogData]);

  const data = useMemo(
    () => mergeDashboardParts(fastData, executiveData, intelligenceData, posthogData),
    [fastData, executiveData, intelligenceData, posthogData],
  );

  const loadFast = useCallback(async ({ manual = false } = {}) => {
    const gen = ++fastGenRef.current;
    if (manual) fastAbortRef.current?.abort();
    const controller = new AbortController();
    fastAbortRef.current = controller;
    if (!fastRef.current || manual) setFastLoading(true);
    setFastError("");

    try {
      const res = await trackRequest("home-fast", () =>
        getSuperadminDashboardHomeFastRequest({ signal: controller.signal }),
      );
      if (controller.signal.aborted) return;
      if (gen !== fastGenRef.current) {
        devLog("home-fast stale response ignored", { gen });
        return;
      }
      setFastData(res?.data || null);
    } catch (e) {
      if (gen !== fastGenRef.current) return;
      const mapped = mapError(e);
      if (mapped.canceled) return;
      setFastError(mapped.message);
    } finally {
      if (fastAbortRef.current === controller) fastAbortRef.current = null;
      if (gen === fastGenRef.current && !controller.signal.aborted) setFastLoading(false);
    }
  }, []);

  const loadExecutive = useCallback(async ({ manual = false } = {}) => {
    if (!executiveRequestedRef.current && !manual) {
      devLog("executive-kpis skipped (not requested yet)");
      return;
    }
    const gen = ++executiveGenRef.current;
    if (manual) executiveAbortRef.current?.abort();
    const controller = new AbortController();
    executiveAbortRef.current = controller;
    if (!executiveRef.current || manual) setExecutiveLoading(true);
    setExecutiveError("");

    try {
      const res = await trackRequest("executive-kpis", () =>
        getSuperadminDashboardExecutiveKpisRequest({
          signal: controller.signal,
          params: { range: posthogRange },
        }),
      );
      if (controller.signal.aborted) return;
      if (gen !== executiveGenRef.current) return;
      setExecutiveData(res?.data || null);
    } catch (e) {
      if (gen !== executiveGenRef.current) return;
      const mapped = mapError(e);
      if (mapped.canceled) return;
      setExecutiveError(mapped.message);
    } finally {
      if (executiveAbortRef.current === controller) executiveAbortRef.current = null;
      if (gen === executiveGenRef.current && !controller.signal.aborted) setExecutiveLoading(false);
    }
  }, [posthogRange]);

  const loadPosthog = useCallback(
    async ({ manual = false } = {}) => {
      if (!posthogRequestedRef.current && !manual) {
        devLog("posthog skipped (collapsed / not requested)");
        return;
      }
      const gen = ++posthogGenRef.current;
      if (manual) posthogAbortRef.current?.abort();
      const controller = new AbortController();
      posthogAbortRef.current = controller;
      if (!posthogRef.current || manual) setPosthogLoading(true);
      setPosthogError("");

      try {
        const res = await trackRequest("posthog", () =>
          getSuperadminVisitorsAnalyticsRequest(
            { range: posthogRange, topLimit: 10 },
            { signal: controller.signal, timeout: 20000 },
          ),
        );
        if (controller.signal.aborted) return;
        if (gen !== posthogGenRef.current) return;
        setPosthogData(res?.data || null);
      } catch (e) {
        if (gen !== posthogGenRef.current) return;
        const mapped = mapError(e);
        if (mapped.canceled) return;
        setPosthogError(mapped.message);
      } finally {
        if (posthogAbortRef.current === controller) posthogAbortRef.current = null;
        if (gen === posthogGenRef.current && !controller.signal.aborted) setPosthogLoading(false);
      }
    },
    [posthogRange],
  );

  const loadIntelligence = useCallback(
    async ({ manual = false } = {}) => {
      if (!intelligenceRequestedRef.current && !manual) {
        devLog("home-intelligence skipped (collapsed / not requested)");
        return;
      }
      const gen = ++intelligenceGenRef.current;
      if (manual) intelligenceAbortRef.current?.abort();
      const controller = new AbortController();
      intelligenceAbortRef.current = controller;
      if (!intelligenceRef.current || manual) setIntelligenceLoading(true);
      setIntelligenceError("");

      try {
        const res = await trackRequest("home-intelligence", () =>
          getSuperadminDashboardHomeIntelligenceRequest({
            signal: controller.signal,
            params: { range: posthogRange },
          }),
        );
        if (controller.signal.aborted) return;
        if (gen !== intelligenceGenRef.current) return;
        setIntelligenceData(res?.data || null);
      } catch (e) {
        if (gen !== intelligenceGenRef.current) return;
        const mapped = mapError(e);
        if (mapped.canceled) return;
        setIntelligenceError(mapped.message);
      } finally {
        if (intelligenceAbortRef.current === controller) intelligenceAbortRef.current = null;
        if (gen === intelligenceGenRef.current && !controller.signal.aborted) {
          setIntelligenceLoading(false);
        }
      }
    },
    [posthogRange],
  );

  useEffect(
    () => () => {
      fastAbortRef.current?.abort();
      executiveAbortRef.current?.abort();
      intelligenceAbortRef.current?.abort();
      posthogAbortRef.current?.abort();
    },
    [],
  );

  const requestExecutive = useCallback(() => {
    if (executiveRef.current || executiveLoading) {
      devLog("executive-kpis deduped (already loaded or in flight)");
      return;
    }
    executiveRequestedRef.current = true;
    void loadExecutive();
  }, [executiveLoading, loadExecutive]);

  const requestPosthog = useCallback(() => {
    if (posthogRef.current || posthogLoading) {
      devLog("posthog deduped (already loaded or in flight)");
      return;
    }
    posthogRequestedRef.current = true;
    void loadPosthog();
  }, [posthogLoading, loadPosthog]);

  const requestIntelligence = useCallback(() => {
    if (intelligenceRef.current || intelligenceLoading) {
      devLog("home-intelligence deduped (already loaded or in flight)");
      return;
    }
    intelligenceRequestedRef.current = true;
    void loadIntelligence();
  }, [intelligenceLoading, loadIntelligence]);

  const refresh = useCallback(() => {
    void loadFast({ manual: true });
    if (executiveRequestedRef.current) void loadExecutive({ manual: true });
    if (posthogRequestedRef.current) void loadPosthog({ manual: true });
    if (intelligenceRequestedRef.current) void loadIntelligence({ manual: true });
  }, [loadFast, loadExecutive, loadPosthog, loadIntelligence]);

  // First paint: home-fast only
  useEffect(() => {
    devLog("mount: loading home-fast only");
    void loadFast();
  }, [loadFast, rangeKey]);

  // Executive grid: after fast completes (does not block hero KPIs)
  useEffect(() => {
    if (fastLoading || !fastData) return;
    requestExecutive();
  }, [fastLoading, fastData, requestExecutive]);

  useEffect(() => {
    setIntelligenceData(null);
    intelligenceRequestedRef.current = false;
    intelligenceGenRef.current += 1;
  }, [rangeKey]);

  useEffect(() => {
    if (!posthogRequestedRef.current) return;
    void loadPosthog({ manual: true });
  }, [loadPosthog, rangeKey]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadFast({ manual: false });
      if (executiveRequestedRef.current) void loadExecutive({ manual: false });
      if (posthogRequestedRef.current) void loadPosthog({ manual: false });
      if (intelligenceRequestedRef.current) void loadIntelligence({ manual: false });
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [loadFast, loadExecutive, loadPosthog, loadIntelligence]);

  const error = fastError || executiveError || intelligenceError || posthogError;

  return {
    data,
    fastData,
    executiveData,
    intelligenceData,
    posthogData,
    fastLoading,
    executiveLoading,
    intelligenceLoading,
    posthogLoading,
    loading: fastLoading && !fastData,
    error,
    fastError,
    executiveError,
    intelligenceError,
    posthogError,
    requestExecutive,
    requestPosthog,
    requestIntelligence,
    refresh,
    refreshIntervalMs: REFRESH_MS,
  };
}
