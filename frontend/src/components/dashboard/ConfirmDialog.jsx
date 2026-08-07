import { useEffect, useId, useRef } from "react";
import { useTranslation } from "../../i18n/LanguageProvider";

const CONFIRM_VARIANT_CLASS = {
  primary: "btn btn-primary",
  danger: "btn btn-danger",
};

/**
 * Destructive / high-friction confirm — UI only.
 * @param {object} p
 * @param {boolean} p.open
 * @param {string} p.title
 * @param {import("react").ReactNode} p.body
 * @param {string} [p.confirmLabel]
 * @param {string} [p.cancelLabel]
 * @param {() => void} p.onConfirm
 * @param {() => void} p.onCancel
 * @param {string} [p.className]
 * @param {string} [p.panelClassName]
 * @param {boolean} [p.confirmFirst]
 * @param {"primary"|"danger"} [p.confirmVariant]
 * @param {string} [p.layerClassName]
 * @param {boolean} [p.confirmBusy]
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "تأكيد",
  cancelLabel = "إلغاء",
  onConfirm,
  onCancel,
  className = "",
  panelClassName = "",
  confirmFirst = false,
  confirmVariant = "primary",
  layerClassName = "z-[1200]",
  confirmBusy = false,
}) {
  const { dir } = useTranslation();
  const titleId = useId();
  const cancelRef = useRef(null);
  const panelRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    const t = window.setTimeout(() => cancelRef.current?.focus(), 0);

    const onKeyDown = (e) => {
      if (e.key === "Escape" && !confirmBusy) {
        e.preventDefault();
        onCancel?.();
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
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKeyDown);
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === "function") {
        try {
          prev.focus();
        } catch {
          /* ignore */
        }
      }
    };
  }, [open, confirmBusy, onCancel]);

  if (!open) return null;

  const confirmBtnClass = CONFIRM_VARIANT_CLASS[confirmVariant] || CONFIRM_VARIANT_CLASS.primary;

  const confirmBtn = (
    <button type="button" className={confirmBtnClass} onClick={onConfirm} disabled={confirmBusy}>
      {confirmLabel}
    </button>
  );
  const cancelBtn = (
    <button ref={cancelRef} type="button" className="btn btn-secondary" onClick={onCancel} disabled={confirmBusy}>
      {cancelLabel}
    </button>
  );

  return (
    <div
      className={`dash-ui-confirm-dialog fixed inset-0 grid place-items-center p-4 ${layerClassName} ${className}`.trim()}
      role="presentation"
    >
      <button
        type="button"
        className="dash-ui-confirm-dialog__backdrop absolute inset-0 bg-slate-900/40"
        aria-label={cancelLabel}
        onClick={confirmBusy ? undefined : onCancel}
        disabled={confirmBusy}
      />
      <div
        ref={panelRef}
        className={`dash-ui-confirm-dialog__panel relative z-[1] w-full max-h-[min(90vh,40rem)] overflow-y-auto rounded-2xl border border-[color:var(--dash-border-strong,#aeb8c6)] bg-[color:var(--dash-card,#fcfcfd)] px-[18px] pb-4 pt-[18px] text-start shadow-[var(--dash-shadow-lg)] ${panelClassName || "max-w-[420px]"}`.trim()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        dir={dir}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="mb-2 mt-0 text-base font-black text-slate-900">
          {title}
        </h2>
        <div className="mb-4 text-[0.9rem] leading-normal text-slate-600">{body}</div>
        <div className="flex flex-wrap justify-end gap-2">
          {confirmFirst ? (
            <>
              {confirmBtn}
              {cancelBtn}
            </>
          ) : (
            <>
              {cancelBtn}
              {confirmBtn}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
