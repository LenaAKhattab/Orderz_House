import { useId } from "react";

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
}) {
  const titleId = useId();
  if (!open) return null;

  const confirmBtn = (
    <button type="button" className="btn btn-primary" onClick={onConfirm}>
      {confirmLabel}
    </button>
  );
  const cancelBtn = (
    <button type="button" className="btn btn-secondary" onClick={onCancel}>
      {cancelLabel}
    </button>
  );

  return (
    <div className={`fixed inset-0 z-[1200] grid place-items-center p-4 ${className}`.trim()} role="presentation">
      <button type="button" className="absolute inset-0 bg-slate-900/35" aria-label="إلغاء" onClick={onCancel} />
      <div
        className="relative z-[1] w-full max-w-[420px] rounded-2xl border border-slate-300/25 bg-white px-[18px] pb-4 pt-[18px] shadow-[0_20px_44px_rgba(15,23,42,0.16)]"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
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
