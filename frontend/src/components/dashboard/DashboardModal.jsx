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
    <div className={`dash-ui-modal fixed inset-0 z-[1200] grid place-items-center p-4 ${className}`.trim()} role="presentation">
      <button
        type="button"
        className="dash-ui-modal__backdrop absolute inset-0 bg-slate-900/35"
        aria-label="إغلاق"
        onClick={onClose}
      />
      <div
        className="dash-ui-modal__panel relative z-[1] flex max-h-[min(88vh,720px)] w-full min-h-0 max-w-[520px] flex-col overflow-hidden rounded-2xl border border-slate-300/25 bg-white shadow-[0_24px_48px_rgba(15,23,42,0.18)]"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title || undefined}
        onMouseDown={(ev) => ev.stopPropagation()}
      >
        <div className="dash-ui-modal__head flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/95 px-[18px] pb-3 pt-4">
          {title ? <h2 className="dash-ui-modal__title m-0 text-[1.05rem] font-black text-slate-900">{title}</h2> : <span />}
          <button
            type="button"
            className="dash-ui-modal__close cursor-pointer rounded-lg border-0 bg-transparent p-1 px-1.5 text-2xl leading-none text-slate-500 hover:bg-slate-400/15 hover:text-slate-900"
            onClick={onClose}
            aria-label="إغلاق"
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
