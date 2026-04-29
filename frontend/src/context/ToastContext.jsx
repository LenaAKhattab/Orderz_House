import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

const DEFAULT_DURATION_MS = 4000;
const EXIT_ANIMATION_MS = 240;
const MAX_TOASTS = 5;

const ToastContext = createContext(null);

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeToast(input, fallbackType = "info") {
  if (typeof input === "string") {
    return {
      type: fallbackType,
      message: input,
    };
  }
  if (!input || typeof input !== "object") {
    return {
      type: fallbackType,
      message: "",
    };
  }
  return {
    type: input.type || fallbackType,
    title: input.title || "",
    message: input.message || "",
    durationMs: input.durationMs,
    autoClose: input.autoClose,
  };
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismissTimersRef = useRef(new Map());

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const pending = dismissTimersRef.current.get(id);
    if (pending) {
      window.clearTimeout(pending);
      dismissTimersRef.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id) => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, closing: true } : t)));
      const existing = dismissTimersRef.current.get(id);
      if (existing) {
        window.clearTimeout(existing);
      }
      const timer = window.setTimeout(() => removeToast(id), EXIT_ANIMATION_MS);
      dismissTimersRef.current.set(id, timer);
    },
    [removeToast],
  );

  const showToast = useCallback((input) => {
    const normalized = normalizeToast(input);
    const id = makeId();
    const resolvedType = ["success", "error", "warning", "info"].includes(normalized.type) ? normalized.type : "info";
    const toast = {
      id,
      type: resolvedType,
      title: normalized.title || "",
      message: normalized.message || "",
      durationMs:
        typeof normalized.durationMs === "number" && normalized.durationMs >= 0 ? normalized.durationMs : DEFAULT_DURATION_MS,
      autoClose: typeof normalized.autoClose === "boolean" ? normalized.autoClose : resolvedType !== "error",
      closing: false,
    };
    setToasts((prev) => [toast, ...prev].slice(0, MAX_TOASTS));
    return id;
  }, []);

  const success = useCallback((payload) => showToast({ ...normalizeToast(payload, "success"), type: "success" }), [showToast]);
  const error = useCallback((payload) => showToast({ ...normalizeToast(payload, "error"), type: "error" }), [showToast]);
  const warning = useCallback((payload) => showToast({ ...normalizeToast(payload, "warning"), type: "warning" }), [showToast]);
  const info = useCallback((payload) => showToast({ ...normalizeToast(payload, "info"), type: "info" }), [showToast]);

  const push = useCallback((payload) => showToast(payload), [showToast]);

  const clear = useCallback(() => {
    setToasts([]);
    for (const timer of dismissTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    dismissTimersRef.current.clear();
  }, []);

  const api = useMemo(
    () => ({
      toasts,
      showToast,
      push,
      toast: { success, error, warning, info, show: showToast },
      success,
      error,
      warning,
      info,
      dismiss,
      clear,
    }),
    [toasts, showToast, push, success, error, warning, info, dismiss, clear],
  );

  return <ToastContext.Provider value={api}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider.");
  }
  return ctx;
}

