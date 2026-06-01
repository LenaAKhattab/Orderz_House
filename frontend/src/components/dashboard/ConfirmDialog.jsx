import { useEffect, useId, useRef } from "react";

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
 * @param {boolean} [p.confirmFirst] — render primary confirm before cancel (matches legacy flows)
 * @param {"primary"|"danger"} [p.confirmVariant]
 * @param {string} [p.layerClassName] — stacking, e.g. z-[1300] above nested modals
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
  confirmFirst = false,
  confirmVariant = "primary",
  layerClassName = "z-[1200]",
}) {
  const titleId = useId();
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const t = window.setTimeout(() => cancelRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

  const confirmBtnClass = CONFIRM_VARIANT_CLASS[confirmVariant] || CONFIRM_VARIANT_CLASS.primary;

  const confirmBtn = (
    <button type="button" className={confirmBtnClass} onClick={onConfirm}>
      {confirmLabel}
    </button>
  );
  const cancelBtn = (
    <button ref={cancelRef} type="button" className="btn btn-secondary" onClick={onCancel}>
      {cancelLabel}
    </button>
  );

  return (
    <div
      className={`dash-ui-confirm-dialog fixed inset-0 grid place-items-center p-4 ${layerClassName} ${className}`.trim()}
      role="presentation"
    >
      <button type="button" className="dash-ui-confirm-dialog__backdrop absolute inset-0 bg-slate-900/40" aria-label="إلغاء" onClick={onCancel} />
      <div
        className="dash-ui-confirm-dialog__panel relative z-[1] w-full max-w-[420px] rounded-2xl border border-slate-300/25 bg-white px-[18px] pb-4 pt-[18px] text-right shadow-[0_20px_44px_rgba(15,23,42,0.16)]"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        dir="rtl"
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
