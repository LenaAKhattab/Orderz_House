import { useCallback, useEffect, useRef, useState } from "react";

const REFRESH_MS = 90_000;

function mapError(e) {
  const code = e?.code || "";
  const message = String(e?.message || "");
  if (code === "ERR_CANCELED" || code === "CanceledError") {
    return { canceled: true, message: "" };
  }
  if (code === "ECONNABORTED" || /timeout/i.test(message)) {
    return { canceled: false, message: "استغرق تحميل هذا القسم وقتًا أطول من المتوقع." };
  }
  return {
    canceled: false,
    message: e?.response?.data?.message || message || "تعذر تحميل هذا القسم.",
  };
}

export function useSuperAdminDashboardIntelligenceSection(fetcher) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const dataRef = useRef(null);
  const inFlightRef = useRef(false);
  const abortRef = useRef(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const load = useCallback(
    async ({ manual = false } = {}) => {
      if (inFlightRef.current && !manual) return;
      if (inFlightRef.current && manual) {
        abortRef.current?.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;
      inFlightRef.current = true;
      if (!dataRef.current) setLoading(true);
      setError("");
      try {
        const res = await fetcher({ signal: controller.signal });
        if (controller.signal.aborted) return;
        setData(res?.data || null);
      } catch (e) {
        if (controller.signal.aborted) return;
        const mapped = mapError(e);
        if (mapped.canceled) return;
        setError(mapped.message);
        setData((prev) => prev);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        inFlightRef.current = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [fetcher],
  );

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
  };
}

