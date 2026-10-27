/**
 * Authenticated training-package Stripe checkout.
 * Success redirect never marks a package paid — status comes from the server, which reconciles
 * unresolved attempts with Stripe. An abandoned checkout (browser Back, closed tab) is resumable
 * ("continue payment") or, once expired, buyable again — never a permanent pending lock.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  cancelTrainingPackageCheckoutRequest,
  createTrainingPackageCheckoutRequest,
  getMyTrainingPackagesRequest,
} from "../services/api";
import { useTranslation } from "../i18n/LanguageProvider";
import { useToast } from "../components/ui/toastContext";
import { usePageRestore } from "./usePageRestore";
import { trainingCheckoutStatesFromSnapshot } from "../lib/trainingCheckoutState";

/** Server error codes with localized copy (the server message is Arabic-only). */
const CHECKOUT_ERROR_KEYS = {
  TRAINING_PACKAGE_PAYMENT_STATUS_UNAVAILABLE: "plans.training.statusUnavailable",
  TRAINING_PACKAGE_PAYMENT_PROCESSING: "plans.training.processingNotice",
};

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

  // Browser Back from Stripe restores this page from BFCache with the redirect still "busy".
  usePageRestore(
    (reason) => {
      if (reason === "pageshow") {
        setBuyBusyCode("");
        setCheckoutError("");
      }
      void refresh().catch(() => {});
    },
    { enabled, onVisible: true },
  );

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
      // Not authoritative: the server reconciles the attempt with Stripe (open stays resumable).
      const reconcile = sessionId
        ? cancelTrainingPackageCheckoutRequest(sessionId).catch(() => {})
        : Promise.resolve();
      void reconcile.then(() => refresh()).catch(() => {});
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
      } catch {
        /* retry below */
      }
      if (cancelled) return;
      // After the return window the card follows the server state (processing / resume / buy).
      if (attempts >= 6) {
        setWaiting(false);
        return;
      }
      timer = window.setTimeout(poll, 2000);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled, refresh, waiting]);

  const checkoutStates = useMemo(() => trainingCheckoutStatesFromSnapshot(snapshot), [snapshot]);
  const hasProcessing = Object.values(checkoutStates).includes("processing");

  // Genuine provider confirmation in progress: recheck periodically (non-destructive).
  useEffect(() => {
    if (!enabled || !hasProcessing || waiting) return undefined;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      void refresh().catch(() => {});
      if (attempts >= 20) window.clearInterval(timer);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [enabled, hasProcessing, refresh, waiting]);

  const startTrainingCheckout = useCallback(
    async (pkg) => {
      const code = String(pkg?.code || pkg?.id || "").trim();
      if (!enabled || !code || buyBusyCode) return;
      if (snapshot?.current?.packageCode === code) return;
      setBuyBusyCode(code);
      setCheckoutError("");
      try {
        // The server resumes an open Stripe session or creates a new one after reconciling.
        const res = await createTrainingPackageCheckoutRequest(code);
        const url = res?.data?.checkoutUrl;
        if (!url) throw new Error(t("plans.training.checkoutMissingUrl"));
        window.location.href = url;
      } catch (err) {
        const errorCode = err?.response?.data?.code;
        const msg = CHECKOUT_ERROR_KEYS[errorCode]
          ? t(CHECKOUT_ERROR_KEYS[errorCode])
          : err?.response?.data?.message || err?.message || t("plans.training.checkoutFailed");
        setCheckoutError(msg);
        push({ type: "warning", message: msg });
        setBuyBusyCode("");
        void refresh().catch(() => {});
      }
    },
    [buyBusyCode, enabled, push, refresh, snapshot?.current?.packageCode, t],
  );

  return {
    snapshot,
    current: snapshot?.current || null,
    pending: snapshot?.pending || null,
    checkoutStates,
    waiting,
    buyBusyCode,
    checkoutError,
    startTrainingCheckout,
    refresh,
  };
}
