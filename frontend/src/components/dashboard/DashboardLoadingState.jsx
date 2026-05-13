/**
 * Loading region — default skeleton bars, or pass custom `children` (e.g. app skeleton).
 * @param {object} p
 * @param {string} [p.label]
 * @param {import("react").ReactNode} [p.children]
 * @param {number} [p.rows]
 * @param {string} [p.className]
 */
export default function DashboardLoadingState({ label, children, rows = 4, className = "" }) {
  const panel =
    "rounded-[length:var(--dash-surface-radius,18px)] border border-slate-200/70 bg-white/90 px-5 py-5 shadow-[var(--dash-card-shadow)] sm:px-6";

  return (
    <div
      className={`dash-ui-loading w-full min-w-0 text-start ${panel} ${className}`.trim()}
      aria-busy="true"
      aria-live="polite"
    >
      {label ? (
        <p className="dash-ui-loading__label mb-3 text-[0.8rem] font-semibold text-slate-500">{label}</p>
      ) : null}
      {children ?? (
        <div className="dash-ui-skeleton-rows grid gap-2.5">
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className="dash-ui-skeleton-rows__bar h-2.5 rounded-md bg-slate-200/90"
              style={{ width: `${68 + (i % 3) * 8}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
