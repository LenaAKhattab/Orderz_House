/**
 * Authenticated training-package Stripe checkout.
 * Success redirect never marks a package paid — status comes from the server.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  cancelTrainingPackageCheckoutRequest,
  createTrainingPackageCheckoutRequest,
  getMyTrainingPackagesRequest,
} from "../services/api";
import { useTranslation } from "../i18n/LanguageProvider";
import { useToast } from "../components/ui/toastContext";

export function useTrainingPackageCheckout({ enabled = true } = {}) {
  const { t } = useTranslation();
  const { push } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState(null);
  const [buyBusyCode, setBuyBusyCode] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [waiting, setWaiting] = useState(false);
  const handledReturnRef = useRef(new Set());
  const returnSessionRef = useRef("");

  const refresh = useCallback(async () => {
    const res = await getMyTrainingPackagesRequest();
    const data = res?.data || null;
    setSnapshot(data);
    return data;
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    refresh().catch(() => {
      if (!cancelled) setSnapshot(null);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return undefined;
    const q = new URLSearchParams(location.search || "");
    const state = String(q.get("trainingCheckout") || "").trim().toLowerCase();
    if (state !== "success" && state !== "cancelled") return undefined;
    const key = `tp:${location.search || ""}`;
    if (handledReturnRef.current.has(key)) return undefined;
    handledReturnRef.current.add(key);
    const sessionId = (q.get("session_id") || "").trim();

    const strip = () => {
      q.delete("trainingCheckout");
      q.delete("session_id");
      if (!q.get("type")) q.set("type", "training");
      const nextSearch = q.toString();
      navigate(
        { pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : "" },
        { replace: true },
      );
    };

    if (state === "cancelled") {
      setWaiting(false);
      if (sessionId) {
        cancelTrainingPackageCheckoutRequest(sessionId).catch(() => {});
      }
      void refresh().catch(() => {});
      strip();
      return undefined;
    }

    returnSessionRef.current = sessionId;
    setWaiting(true);
    strip();
    return undefined;
  }, [enabled, location.pathname, location.search, navigate, refresh]);

  useEffect(() => {
    if (!enabled || !waiting) return undefined;
    let attempts = 0;
    let timer;
    let cancelled = false;
    const poll = async () => {
      attempts += 1;
      try {
        const data = await refresh();
        const sid = returnSessionRef.current;
        const paid = (data?.purchases || []).some(
          (row) => row.status === "paid" && (!sid || row.stripeCheckoutSessionId === sid),
        );
        if (cancelled) return;
        if (paid) {
          setWaiting(false);
          return;
        }
        if (attempts >= 6) return;
      } catch {
        if (attempts >= 6) return;
      }
      timer = window.setTimeout(poll, 2000);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled, refresh, waiting]);

  const startTrainingCheckout = useCallback(
    async (pkg) => {
      const code = String(pkg?.code || pkg?.id || "").trim();
      if (!enabled || !code || buyBusyCode) return;
      if (snapshot?.current?.packageCode === code) return;
      setBuyBusyCode(code);
      setCheckoutError("");
      try {
        const res = await createTrainingPackageCheckoutRequest(code);
        const url = res?.data?.checkoutUrl;
        if (!url) throw new Error(t("plans.training.checkoutMissingUrl"));
        window.location.href = url;
      } catch (err) {
        const msg = err?.response?.data?.message || err?.message || t("plans.training.checkoutFailed");
        setCheckoutError(msg);
        push({ type: "warning", message: msg });
        setBuyBusyCode("");
      }
    },
    [buyBusyCode, enabled, push, snapshot?.current?.packageCode, t],
  );

  return {
    snapshot,
    current: snapshot?.current || null,
    pending: snapshot?.pending || null,
    waiting,
    buyBusyCode,
    checkoutError,
    startTrainingCheckout,
    refresh,
  };
}
