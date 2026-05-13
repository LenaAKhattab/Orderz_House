/**
 * @param {object} p
 * @param {string} p.title
 * @param {string} [p.description]
 * @param {import("react").ReactNode} [p.icon]
 * @param {import("react").ReactNode} [p.actions]
 * @param {string} [p.className]
 */
export default function DashboardEmptyState({ title, description, icon, actions, className = "" }) {
  const shell =
    "rounded-[length:var(--dash-surface-radius,18px)] border border-dashed border-slate-300/55 bg-slate-50/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

  return (
    <div
      className={`dash-ui-empty min-w-0 px-5 py-8 text-center sm:px-7 sm:py-9 ${shell} ${className}`.trim()}
      role="status"
    >
      {icon ? (
        <div className="dash-ui-empty__icon mb-3 flex justify-center text-slate-400 [&>svg]:opacity-90">{icon}</div>
      ) : null}
      <p className="dash-ui-empty__title m-0 text-base font-bold text-slate-800">{title}</p>
      {description ? (
        <p className="dash-ui-empty__desc mx-auto mt-2 max-w-md text-[0.88rem] font-medium leading-relaxed text-slate-500">
          {description}
        </p>
      ) : null}
      {actions ? (
        <div className="dash-ui-empty__actions mt-5 flex flex-wrap justify-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
