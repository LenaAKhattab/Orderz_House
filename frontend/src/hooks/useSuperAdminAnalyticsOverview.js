import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchSuperAdminOverview } from "../services/superAdminAnalytics";

const REFRESH_MS = 60_000;

/**
 * Loads Super Admin analytics overview (PostHog + DB). Auto-refreshes every 60s.
 */
export function useSuperAdminAnalyticsOverview({ range = "7d", topLimit = 10 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setErrorCode("");
    try {
      const res = await fetchSuperAdminOverview({
        range,
        topLimit,
      });
      setData(res?.data || null);
    } catch (e) {
      const message = e?.response?.data?.message || e?.message || "تعذر تحميل لوحة التحليلات.";
      const code = e?.response?.data?.code || "";
      setError(String(message));
      setErrorCode(String(code));
      setData((prev) => prev);
    } finally {
      setLoading(false);
    }
  }, [range, topLimit]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const chartPack = useMemo(() => buildChartPack(data), [data]);

  return {
    data,
    loading,
    error,
    errorCode,
    refresh: load,
    chartPack,
    refreshIntervalMs: REFRESH_MS,
  };
}

function indexByDate(rows, key) {
  const m = new Map();
  for (const r of rows || []) {
    const d = String(r.date || "").slice(0, 10);
    if (!d) continue;
    m.set(d, Number(r[key]) || 0);
  }
  return m;
}

/** Align last 7 days revenue (DB) with PostHog trend rows for charts. */
export function buildChartPack(data) {
  const rev = data?.trends?.revenueByDay || [];
  const vis = data?.trends?.visitorsByDay || [];
  const ord = data?.trends?.ordersByDay || [];

  const dates = new Set();
  for (const r of rev) dates.add(String(r.date).slice(0, 10));
  for (const r of vis) dates.add(String(r.date).slice(0, 10));
  for (const r of ord) dates.add(String(r.date).slice(0, 10));

  const sorted = [...dates].filter(Boolean).sort();
  const vm = indexByDate(vis, "visitors");
  const om = indexByDate(ord, "orders");
  const rm = new Map();
  for (const r of rev) {
    const d = String(r.date).slice(0, 10);
    rm.set(d, Number(r.revenueJod) || 0);
  }

  const unified = sorted.map((date) => ({
    date,
    label: formatChartDay(date),
    visitors: vm.get(date) || 0,
    orders: om.get(date) || 0,
    revenueJod: rm.get(date) || 0,
  }));

  return { unified, visitors: vis, orders: ord, revenue: rev };
}

function formatChartDay(isoDate) {
  try {
    const [y, m, d] = isoDate.split("-").map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    return dt.toLocaleDateString("ar-JO-u-nu-latn", { month: "short", day: "numeric" });
  } catch {
    return isoDate;
  }
}
