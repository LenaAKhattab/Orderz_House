import { useCallback, useMemo, useState } from "react";
import { ToastContext } from "./toastContext";

function ToastItem({ toast, onDismiss }) {
  return (
    <div className={`toast toast-${toast.type || "info"}`} role="status" aria-live="polite">
      <div className="toast-title">{toast.title}</div>
      {toast.message ? <div className="toast-message">{toast.message}</div> : null}
      <button type="button" className="toast-close" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((toast) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    const next = { id, type: "info", title: "Notice", message: "", ...toast };
    setToasts((prev) => [next, ...prev].slice(0, 4));
    window.setTimeout(() => dismiss(id), next.durationMs || 3500);
  }, [dismiss]);

  const api = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" aria-label="Notifications">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

