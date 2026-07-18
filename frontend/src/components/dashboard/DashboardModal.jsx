import { useEffect, useId, useRef } from "react";
import { useTranslation } from "../../i18n/LanguageProvider";

/**
 * Minimal modal shell — UI only; parent controls open state.
 * Supports focus trap, Escape, backdrop close, body scroll lock, and focus return.
 * @param {object} p
 * @param {boolean} p.open
 * @param {string} [p.title]
 * @param {import("react").ReactNode} [p.subtitle]
 * @param {string} [p.ariaLabel]
 * @param {() => void} p.onClose
 * @param {import("react").ReactNode} p.children
 * @param {import("react").ReactNode} [p.footer]
 * @param {string} [p.className]
 * @param {string} [p.panelClassName]
 * @param {boolean} [p.closeDisabled]
 * @param {import("react").RefObject<HTMLElement | null>} [p.triggerRef]
 */
export default function DashboardModal({
  open,
  title,
  subtitle = null,
  ariaLabel,
  onClose,
  children,
  footer,
  className = "",
  panelClassName = "",
  closeDisabled = false,
  triggerRef = null,
}) {
  const { dir } = useTranslation();
  const titleId = useId();
  const subtitleId = useId();
  const panelRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      const root = panelRef.current;
      if (!root) return;
      const focusable = root.querySelector(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable && typeof focusable.focus === "function") focusable.focus();
    }, 0);

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        if (closeDisabled) return;
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
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
      const preferred = triggerRef?.current;
      const prev = preferred || previousFocusRef.current;
      if (prev && typeof prev.focus === "function") {
        try {
          prev.focus();
        } catch {
          /* ignore */
        }
      }
    };
  }, [open, closeDisabled, onClose, triggerRef]);

  if (!open) return null;

  const closeLabel = "إغلاق";

  return (
    <div
      className={`dash-ui-modal fixed inset-0 z-[1200] grid place-items-center p-4 ${className}`.trim()}
      role="presentation"
    >
      <button
        type="button"
        className="dash-ui-modal__backdrop absolute inset-0 bg-slate-900/35"
        aria-label={closeLabel}
        onClick={closeDisabled ? undefined : onClose}
        disabled={closeDisabled}
      />
      <div
        ref={panelRef}
        className={`dash-ui-modal__panel relative z-[1] flex max-h-[min(88vh,720px)] w-full min-h-0 max-w-[520px] flex-col overflow-hidden rounded-2xl border border-slate-300/25 bg-white shadow-[0_24px_48px_rgba(15,23,42,0.18)] ${panelClassName}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={subtitle ? subtitleId : undefined}
        aria-label={ariaLabel || (!title ? "Dialog" : undefined)}
        dir={dir}
        onMouseDown={(ev) => ev.stopPropagation()}
      >
        <div className="dash-ui-modal__head flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/95 px-[18px] pb-3 pt-4">
          <div className="min-w-0 flex-1">
            {title ? (
              <h2 id={titleId} className="dash-ui-modal__title m-0 text-[1.05rem] font-black text-slate-900">
                {title}
              </h2>
            ) : (
              <span />
            )}
            {subtitle ? (
              <p id={subtitleId} className="dash-ui-modal__hint mb-0 mt-1.5">
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="dash-ui-modal__close cursor-pointer rounded-lg border-0 bg-transparent p-1 px-1.5 text-2xl leading-none text-slate-500 hover:bg-slate-400/15 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onClose}
            aria-label={closeLabel}
            disabled={closeDisabled}
          >
            ×
          </button>
        </div>
        <div className="dash-ui-modal__body min-h-0 flex-1 overflow-auto px-[18px] py-4">{children}</div>
        {footer ? (
          <div className="dash-ui-modal__foot flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200/95 px-[18px] pb-4 pt-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
