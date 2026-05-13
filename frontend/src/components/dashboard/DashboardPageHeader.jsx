import { Link } from "react-router-dom";

/**
 * Reusable top header for admin dashboard pages (RTL-first).
 * Visual shell only — no data fetching or permissions.
 *
 * **Layout guardrail**
 * - The header card is **`width: 100%`** of its parent; in migrated flows the parent should be
 *   `DashboardShell` only. Do not wrap this header in extra max-width / centered containers
 *   that shrink the card relative to `DashboardSection` — keep one visual column with the shell.
 *
 * @param {object} props
 * @param {string} [props.eyebrow] — small label above title, e.g. "لوحة التحكم"
 * @param {string} props.title
 * @param {string} [props.description]
 * @param {{ label: string, href?: string }[]} [props.breadcrumbs] — last item may omit href
 * @param {import("react").ReactNode} [props.actions] — primary buttons / controls
 * @param {import("react").ReactNode} [props.secondaryActions] — optional second row in actions column
 * @param {import("react").ReactNode} [props.statusBadge] — pill or custom node beside title
 * @param {import("react").ReactNode} [props.alert] — e.g. inline error below description
 * @param {string} [props.className] — on outer <header>
 */
export default function DashboardPageHeader({
  eyebrow,
  title,
  description,
  breadcrumbs,
  actions,
  secondaryActions,
  statusBadge,
  alert,
  className = "",
}) {
  const crumbs = Array.isArray(breadcrumbs) ? breadcrumbs.filter((c) => c && String(c.label || "").trim()) : [];

  const actionsRowClass =
    "flex flex-wrap justify-start gap-2 rtl:justify-end max-sm:justify-stretch max-sm:rtl:justify-stretch max-sm:[&_.btn]:flex-1 max-sm:[&_.btn]:justify-center";

  const cardShell =
    "w-full min-w-0 max-w-full box-border rounded-[length:var(--dash-surface-radius,18px)] border border-[color:var(--dash-card-border)] bg-white p-5 shadow-[var(--dash-card-shadow)] sm:p-6";

  return (
    <header className={`mb-5 w-full min-w-0 [direction:inherit] [text-align:inherit] ${className}`.trim()} role="banner">
      <div data-dashboard-header className={cardShell}>
        {crumbs.length > 0 ? (
          <nav className="mb-3.5" aria-label="مسار التنقل">
            <ol className="m-0 flex list-none flex-wrap items-center gap-x-1.5 gap-y-0.5 p-0 text-[0.75rem] font-semibold text-slate-400">
              {crumbs.map((cr, i) => {
                const label = String(cr.label || "").trim();
                const hasHref = Boolean(cr.href && String(cr.href).trim());
                return (
                  <li
                    key={`${label}-${i}`}
                    className="not-last:after:ms-1.5 not-last:after:inline not-last:after:font-semibold not-last:after:text-slate-400 not-last:after:opacity-50 not-last:after:content-['›'] not-last:after:pointer-events-none"
                  >
                    {hasHref ? (
                      <Link
                        to={cr.href}
                        className="text-inherit no-underline transition-colors hover:text-[color:var(--primary,#2f3b65)] hover:underline"
                      >
                        {label}
                      </Link>
                    ) : (
                      <span
                        className="text-slate-500"
                        aria-current={i === crumbs.length - 1 ? "page" : undefined}
                      >
                        {label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        ) : null}

        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0 flex-[1_1_220px] text-start">
            {eyebrow ? (
              <p className="mb-2 mt-0 text-[0.8rem] font-bold leading-snug tracking-wide text-slate-500">
                {eyebrow}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
              <h1 className="m-0 text-[clamp(1.35rem,2.4vw,1.875rem)] font-bold leading-tight tracking-tight text-slate-900">
                {title}
              </h1>
              {statusBadge ? (
                typeof statusBadge === "string" ? (
                  <span className="inline-flex items-center rounded-full border border-[rgba(47,59,101,0.12)] bg-[rgba(47,59,101,0.07)] px-2.5 py-0.5 text-[0.72rem] font-bold text-[color:var(--primary,#2f3b65)]">
                    {statusBadge}
                  </span>
                ) : (
                  statusBadge
                )
              ) : null}
            </div>
            {description ? (
              <p className="mb-0 mt-2.5 max-w-3xl text-[0.9rem] leading-relaxed text-slate-500">{description}</p>
            ) : null}
            {alert ? <div className="mt-3.5 [&_.auth-form-error]:mb-0">{alert}</div> : null}
          </div>

          {actions || secondaryActions ? (
            <div className="flex min-w-[min(100%,200px)] shrink-0 flex-col items-stretch gap-2.5 max-sm:w-full max-sm:min-w-0">
              {actions ? <div className={actionsRowClass}>{actions}</div> : null}
              {secondaryActions ? (
                <div className={`${actionsRowClass} opacity-95`}>{secondaryActions}</div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
