/**
 * Card wrapper for charts — title row + body slot.
 * @param {object} p
 * @param {string} [p.title]
 * @param {import("react").ReactNode} [p.actions]
 * @param {import("react").ReactNode} p.children
 * @param {string} [p.className]
 */
export default function DashboardChartCard({ title, actions, children, className = "" }) {
  const hasHead = Boolean(title || actions);

  const cardShell =
    "rounded-[length:var(--dash-surface-radius,18px)] border border-[color:var(--dash-card-border)] bg-white shadow-[var(--dash-card-shadow)]";

  return (
    <div className={`dash-ui-chart-card flex min-h-0 min-w-0 flex-col ${cardShell} p-5 sm:p-6 ${className}`.trim()}>
      {hasHead ? (
        <div className="dash-ui-chart-card__head mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          {title ? (
            <h3 className="dash-ui-chart-card__title m-0 text-base font-bold tracking-tight text-slate-900">{title}</h3>
          ) : (
            <span />
          )}
          {actions ? <div className="shrink-0 [&_.input]:rounded-lg [&_.input]:border-slate-200/90">{actions}</div> : null}
        </div>
      ) : null}
      <div className="dash-ui-chart-card__body min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}
