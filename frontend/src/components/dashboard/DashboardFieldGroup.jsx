/**
 * Groups a label, optional helper copy, and field controls (children).
 * @param {object} p
 * @param {import("react").ReactNode} p.children
 * @param {string} p.label
 * @param {string} [p.description]
 * @param {string} [p.hint]
 * @param {string} [p.className]
 */
export default function DashboardFieldGroup({ label, description, hint, children, className = "" }) {
  return (
    <div className={`dash-ui-field-group mb-3.5 flex flex-col gap-1.5 last:mb-0 ${className}`.trim()}>
      <span className="dash-ui-field-group__label text-[0.82rem] font-bold text-slate-600">{label}</span>
      {description ? (
        <p className="dash-ui-field-group__desc m-0 text-[0.78rem] leading-snug text-slate-400">{description}</p>
      ) : null}
      {children}
      {hint ? (
        <p className="dash-ui-field-group__desc m-0 text-[0.78rem] leading-snug text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}
