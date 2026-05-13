/**
 * Inline error panel — optional retry control via `actions` slot.
 * @param {object} p
 * @param {import("react").ReactNode} p.message
 * @param {import("react").ReactNode} [p.actions]
 * @param {string} [p.className]
 */
export default function DashboardErrorState({ message, actions, className = "" }) {
  return (
    <div
      className={`dash-ui-error mb-4 rounded-[length:var(--dash-surface-radius,18px)] border border-red-200/90 bg-red-50/90 px-4 py-3.5 text-start text-[0.9rem] font-semibold leading-snug text-red-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-5 ${className}`.trim()}
      role="alert"
    >
      {message}
      {actions ? (
        <div className="dash-ui-error__actions mt-3 flex flex-wrap gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
