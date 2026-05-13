/**
 * Minimal modal shell — UI only; parent controls open state and focus.
 * @param {object} p
 * @param {boolean} p.open
 * @param {string} [p.title]
 * @param {string} [p.ariaLabel]
 * @param {() => void} p.onClose
 * @param {import("react").ReactNode} p.children
 * @param {import("react").ReactNode} [p.footer]
 * @param {string} [p.className]
 */
export default function DashboardModal({ open, title, ariaLabel, onClose, children, footer, className = "" }) {
  if (!open) return null;

  return (
    <div className={`fixed inset-0 z-[1200] grid place-items-center p-4 ${className}`.trim()} role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/35"
        aria-label="إغلاق"
        onClick={onClose}
      />
      <div
        className="relative z-[1] flex max-h-[min(88vh,720px)] w-full min-h-0 max-w-[520px] flex-col overflow-auto rounded-2xl border border-slate-300/25 bg-white shadow-[0_24px_48px_rgba(15,23,42,0.18)]"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title || undefined}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200/95 px-[18px] pb-3 pt-4">
          {title ? <h2 className="m-0 text-[1.05rem] font-black text-slate-900">{title}</h2> : <span />}
          <button
            type="button"
            className="cursor-pointer rounded-lg border-0 bg-transparent p-1 px-1.5 text-2xl leading-none text-slate-500 hover:bg-slate-400/15 hover:text-slate-900"
            onClick={onClose}
            aria-label="إغلاق"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 px-[18px] py-4">{children}</div>
        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200/95 px-[18px] pb-4 pt-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
