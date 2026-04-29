import { useEffect, useRef } from "react";

const ICON_BY_TYPE = {
  success: "✓",
  error: "!",
  warning: "!",
  info: "i",
};

const TITLE_BY_TYPE = {
  success: "نجاح",
  error: "خطأ",
  warning: "تنبيه",
  info: "معلومة",
};

export default function Toast({ toast, index = 0, onClose }) {
  const timerRef = useRef(null);
  const remainingRef = useRef(Math.max(0, Number(toast.durationMs) || 0));
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (!toast.autoClose || toast.closing) return undefined;

    const schedule = (ms) => {
      window.clearTimeout(timerRef.current);
      startedAtRef.current = Date.now();
      timerRef.current = window.setTimeout(() => onClose(toast.id), Math.max(0, ms));
    };

    schedule(remainingRef.current);

    return () => {
      window.clearTimeout(timerRef.current);
    };
  }, [toast.id, toast.autoClose, toast.closing, onClose]);

  const pauseTimer = () => {
    if (!toast.autoClose || toast.closing) return;
    window.clearTimeout(timerRef.current);
    const elapsed = Date.now() - startedAtRef.current;
    remainingRef.current = Math.max(0, remainingRef.current - elapsed);
  };

  const resumeTimer = () => {
    if (!toast.autoClose || toast.closing) return;
    startedAtRef.current = Date.now();
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => onClose(toast.id), Math.max(0, remainingRef.current));
  };

  const type = toast.type || "info";
  const icon = ICON_BY_TYPE[type] || ICON_BY_TYPE.info;
  const title = toast.title || TITLE_BY_TYPE[type] || TITLE_BY_TYPE.info;

  return (
    <article
      className={`toast toast-${type} ${toast.closing ? "toast--closing" : "toast--enter"}`.trim()}
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
      style={{ "--toast-index": index }}
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
    >
      <div className="toast-icon" aria-hidden="true">
        {icon}
      </div>
      <div className="toast-content">
        <div className="toast-title">{title}</div>
        {toast.message ? <div className="toast-message">{toast.message}</div> : null}
      </div>
      <button type="button" className="toast-close" onClick={() => onClose(toast.id)} aria-label="إغلاق التنبيه">
        ×
      </button>
    </article>
  );
}

