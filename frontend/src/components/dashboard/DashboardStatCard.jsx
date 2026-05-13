/**
 * KPI tile — optional icon chip, label, value, hint and/or trend (presentation only).
 * @param {object} p
 * @param {string} p.label
 * @param {import("react").ReactNode} p.value
 * @param {string} [p.hint]
 * @param {import("react").ReactNode} [p.trend] — e.g. colored % change; shown under value when set
 * @param {import("react").ReactNode} [p.icon] — placed in a soft tinted chip
 * @param {string} [p.className]
 */
export default function DashboardStatCard({ label, value, hint, trend, icon, className = "" }) {
  const cardShell =
    "rounded-[length:var(--dash-surface-radius,18px)] border border-[color:var(--dash-card-border)] bg-white shadow-[var(--dash-card-shadow)]";

  return (
    <article className={`dash-ui-stat-card flex min-h-[7.25rem] flex-col ${cardShell} p-5 ${className}`.trim()}>
      <div className="flex flex-1 items-start gap-3.5">
        {icon ? (
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[color:var(--dash-icon-chip-bg)] text-[color:var(--primary,#2f3b65)] [&>svg]:h-5 [&>svg]:w-5"
            aria-hidden
          >
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="dash-ui-stat-card__label m-0 text-[0.72rem] font-semibold leading-snug text-slate-500">{label}</p>
          <p className="dash-ui-stat-card__value m-0 mt-1 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {value}
          </p>
        </div>
      </div>
      {trend ? (
        <div className="dash-ui-stat-card__trend mt-3 text-[0.78rem] font-semibold leading-snug text-slate-600">{trend}</div>
      ) : null}
      {hint ? (
        <p className={`dash-ui-stat-card__hint m-0 text-[0.75rem] leading-snug text-slate-400 ${trend ? "mt-1.5" : "mt-3"}`}>
          {hint}
        </p>
      ) : null}
    </article>
  );
}
