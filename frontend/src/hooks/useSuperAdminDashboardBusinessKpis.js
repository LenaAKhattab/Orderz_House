import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSuperAdminBusinessKpis } from "../services/superAdminAnalytics";

const REFRESH_MS = 60_000;

function mapBusinessKpisError(e) {
  const code = e?.code || "";
  const message = String(e?.message || "");
  if (code === "ERR_CANCELED" || code === "CanceledError") {
    return { message: "", code: "", canceled: true };
  }
  if (code === "ECONNABORTED" || /timeout/i.test(message)) {
    return {
      message: "تعذر تحميل مؤشرات الأعمال حالياً.",
      code: "TIMEOUT",
      canceled: false,
    };
  }
  return {
    message: e?.response?.data?.message || message || "تعذر تحميل مؤشرات الأعمال.",
    code: e?.response?.data?.code || "",
    canceled: false,
  };
}

/**
 * Fast Postgres business KPIs for Super Admin home (revenue, subscriptions, revenue trend).
 */
export function useSuperAdminDashboardBusinessKpis() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const dataRef = useRef(null);
  const inFlightRef = useRef(false);
  const abortRef = useRef(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const load = useCallback(async ({ manual = false } = {}) => {
    if (inFlightRef.current && !manual) {
      return;
    }

    if (inFlightRef.current && manual) {
      abortRef.current?.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;
    inFlightRef.current = true;

    if (!dataRef.current) {
      setLoading(true);
    }
    setError("");

    try {
      const res = await fetchSuperAdminBusinessKpis({ signal: controller.signal });
      if (controller.signal.aborted) return;
      setData(res?.data || null);
    } catch (e) {
      if (controller.signal.aborted) return;
      const mapped = mapBusinessKpisError(e);
      if (mapped.canceled) return;
      setError(String(mapped.message));
      setData((prev) => prev);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      inFlightRef.current = false;
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => void load({ manual: false }), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  return {
    data,
    loading,
    error,
    refresh: () => load({ manual: true }),
    refreshIntervalMs: REFRESH_MS,
  };
}
