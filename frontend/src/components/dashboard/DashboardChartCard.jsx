/**
 * Card wrapper for charts — title row + body slot.
 * @param {object} p
 * @param {string} [p.title]
 * @param {string} [p.description] — muted subtitle (period / unit)
 * @param {import("react").ReactNode} [p.actions]
 * @param {import("react").ReactNode} p.children
 * @param {string} [p.className]
 */
export default function DashboardChartCard({ title, description, actions, children, className = "" }) {
  const hasHead = Boolean(title || description || actions);

  const cardShell = "dash-ui-surface--soft";

  return (
    <div className={`dash-ui-chart-card flex min-h-0 min-w-0 flex-col ${cardShell} p-5 sm:p-6 ${className}`.trim()}>
      {hasHead ? (
        <div className="dash-ui-chart-card__head mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="min-w-0">
            {title ? (
              <h3 className="dash-ui-chart-card__title m-0 text-base font-bold tracking-tight text-slate-900">{title}</h3>
            ) : null}
            {description ? (
              <p className="sa-chart-card__desc m-0 mt-0.5 text-[0.72rem] font-semibold text-slate-400">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0 [&_.input]:rounded-lg [&_.input]:border-slate-200/90">{actions}</div> : null}
        </div>
      ) : null}
      <div className="dash-ui-chart-card__body min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}

const chartSkelBar = "dash-ui-skeleton-rows__bar block rounded-md bg-slate-200/90";

/**
 * Chart card placeholder — title row + canvas block sized like Super Admin trend charts.
 * @param {object} p
 * @param {string} [p.className]
 * @param {"primary" | "secondary"} [p.variant]
 */
export function DashboardChartCardSkeleton({ className = "", variant = "primary" }) {
  const cardShell = "dash-ui-surface--soft";
  const canvasHeight = variant === "primary" ? "h-[168px]" : "h-[128px]";
  const headPad = variant === "primary" ? "mb-3 pb-3" : "mb-2.5 pb-2.5";

  return (
    <div
      className={`dash-ui-chart-card flex min-h-0 min-w-0 flex-col ${cardShell} p-5 sm:p-6 ${className}`.trim()}
      aria-hidden
    >
      <div className={`dash-ui-chart-card__head flex border-b border-slate-100 ${headPad}`}>
        <span className={`${chartSkelBar} h-4 w-[38%]`} />
      </div>
      <div className="dash-ui-chart-card__body min-h-0 min-w-0 flex-1">
        <span className={`${chartSkelBar} ${canvasHeight} w-full rounded-xl`} />
      </div>
    </div>
  );
}
