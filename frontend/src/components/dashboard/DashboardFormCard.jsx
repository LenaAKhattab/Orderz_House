/**
 * Nested form surface (optional title/description + body + footer slot).
 * @param {object} p
 * @param {import("react").ReactNode} p.children
 * @param {string} [p.title]
 * @param {string} [p.description]
 * @param {import("react").ReactNode} [p.footer]
 * @param {string} [p.className]
 */
export default function DashboardFormCard({ title, description, children, footer, className = "" }) {
  const hasHead = Boolean(title || description);

  return (
    <div
      className={`dash-ui-form-card min-w-0 rounded-xl border border-slate-200/90 bg-[#fafbfc] px-[18px] pb-5 pt-[18px] text-start ${className}`.trim()}
    >
      {hasHead ? (
        <div className="dash-ui-form-card__head mb-3.5">
          {title ? (
            <h3 className="dash-ui-form-card__title m-0 text-[0.92rem] font-extrabold text-slate-700">{title}</h3>
          ) : null}
          {description ? (
            <p className="dash-ui-form-card__desc mt-1 text-[0.8rem] leading-snug text-slate-400">{description}</p>
          ) : null}
        </div>
      ) : null}
      <div className="dash-ui-form-card__body min-w-0">{children}</div>
      {footer ? (
        <div className="dash-ui-form-card__footer mt-4 border-t border-slate-200/85 pt-3.5">{footer}</div>
      ) : null}
    </div>
  );
}
