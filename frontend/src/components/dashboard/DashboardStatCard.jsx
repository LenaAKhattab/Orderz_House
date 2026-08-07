const skelBar = "dash-ui-skeleton-rows__bar block rounded-md bg-[color:var(--dash-skel-from,#e5e9ef)]";

/**
 * KPI tile — optional icon chip, label, value, hint and/or trend (presentation only).
 * @param {object} p
 * @param {string} p.label
 * @param {import("react").ReactNode} p.value
 * @param {string} [p.hint]
 * @param {string} [p.scopeLabel] — muted data scope, e.g. "إجمالي المنصة"
 * @param {import("react").ReactNode} [p.trend] — e.g. colored % change; shown under value when set
 * @param {import("react").ReactNode} [p.icon] — placed in a soft tinted chip
 * @param {string} [p.className]
 */
export default function DashboardStatCard({ label, value, hint, scopeLabel, trend, icon, className = "" }) {
  const cardShell = "dash-ui-surface--soft";

  return (
    <article className={`dash-ui-stat-card flex min-h-[7.25rem] flex-col ${cardShell} p-5 ${className}`.trim()}>
      <div className="flex flex-1 items-start gap-3.5">
        {icon ? (
          <div
            className="dash-ui-stat-card__icon-chip flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[color:var(--primary,#2f3b65)] [&>svg]:h-5 [&>svg]:w-5"
            aria-hidden
          >
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="dash-ui-stat-card__label m-0 text-[0.8125rem] font-semibold leading-snug text-[color:var(--dash-text-secondary,#4b5563)]">{label}</p>
          {scopeLabel ? (
            <p className="sa-metric-scope m-0 mt-0.5" aria-label={`نطاق البيانات: ${scopeLabel}`}>
              {scopeLabel}
            </p>
          ) : null}
          <p className="dash-ui-stat-card__value m-0 mt-1 text-2xl font-bold tracking-tight text-[color:var(--dash-text,#172033)] tabular-nums">
            {value}
          </p>
        </div>
      </div>
      {trend ? (
        <div className="dash-ui-stat-card__trend mt-3 text-[0.8125rem] font-semibold leading-snug text-[color:var(--dash-text-secondary,#4b5563)]">{trend}</div>
      ) : null}
      {hint ? (
        <p className={`dash-ui-stat-card__hint m-0 text-[0.8125rem] leading-snug text-[color:var(--dash-text-muted,#667085)] ${trend ? "mt-1.5" : "mt-3"}`}>
          {hint}
        </p>
      ) : null}
    </article>
  );
}

/**
 * Stat card placeholder — matches `DashboardStatCard` layout (label, value, hint, optional icon).
 * @param {object} p
 * @param {string} [p.className]
 * @param {boolean} [p.withIcon]
 */
export function DashboardStatCardSkeleton({ className = "", withIcon = true }) {
  const cardShell = "dash-ui-surface--soft";

  return (
    <article
      className={`dash-ui-stat-card flex min-h-[7.25rem] flex-col ${cardShell} p-5 ${className}`.trim()}
      aria-hidden
    >
      <div className="flex flex-1 items-start gap-3.5">
        {withIcon ? <span className={`${skelBar} h-11 w-11 shrink-0 rounded-xl`} /> : null}
        <div className="min-w-0 flex-1">
          <span className={`${skelBar} h-3 w-[58%]`} />
          <span className={`${skelBar} mt-2.5 h-8 w-[42%]`} />
        </div>
      </div>
      <span className={`${skelBar} mt-3 h-2.5 w-[72%]`} />
    </article>
  );
}
