import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/clientAreaResources";
import "./order-dialog.css";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared order dialog shell (delivery review, revision request, bid offers…).
 * Same visual language as the create-order modal: icon chip + title + close, scrollable body, footer actions.
 * Escape / backdrop close (blocked while `busy`), focus trap, focus restore, body scroll lock.
 *
 * @param {{ open: boolean, onClose: () => void, title: string, subtitle?: import("react").ReactNode, icon?: import("react").ReactNode, size?: "sm"|"md"|"lg", busy?: boolean, footer?: import("react").ReactNode, children: import("react").ReactNode, className?: string }} props
 */
export default function OrderDialog({ open, onClose, title, subtitle, icon, size = "md", busy = false, footer, children, className = "" }) {
  const { t, dir } = useTranslation();
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    busyRef.current = busy;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector("[data-autofocus]") || panel.querySelector(".oh-dialog__body " + FOCUSABLE);
      (first || panel).focus();
    }, 0);
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        if (!busyRef.current) {
          e.preventDefault();
          onCloseRef.current?.();
        }
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      if (previous && typeof previous.focus === "function") {
        try {
          previous.focus();
        } catch {
          /* ignore */
        }
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="oh-dialog-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={`oh-dialog oh-dialog--${size} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? descId : undefined}
        aria-busy={busy || undefined}
        tabIndex={-1}
        dir={dir}
      >
        <header className="oh-dialog__head">
          {icon ? (
            <span className="oh-dialog__icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <div className="oh-dialog__titles">
            <h2 id={titleId} className="oh-dialog__title">
              {title}
            </h2>
            {subtitle ? (
              <p id={descId} className="oh-dialog__subtitle">
                {subtitle}
              </p>
            ) : null}
          </div>
          <button type="button" className="oh-dialog__close" onClick={onClose} disabled={busy} aria-label={t("clientArea.common.closeAria")}>
            <X size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </header>
        <div className="oh-dialog__body">{children}</div>
        {footer ? <footer className="oh-dialog__foot">{footer}</footer> : null}
      </div>
    </div>
  );
}
