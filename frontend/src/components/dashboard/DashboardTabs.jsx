/**
 * Tab list container — compose with `DashboardTab` children.
 * @param {{ "aria-label"?: string; children: import("react").ReactNode; className?: string }} p
 */
export default function DashboardTabs({ "aria-label": ariaLabel = "أقسام", children, className = "" }) {
  return (
    <div
      className={`dash-ui-tabs mb-3.5 flex flex-wrap gap-1.5 rounded-xl border border-slate-300/25 bg-slate-50/90 p-1 ${className}`.trim()}
      role="tablist"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}

/**
 * @param {object} p
 * @param {boolean} p.selected
 * @param {() => void} p.onSelect
 * @param {import("react").ReactNode} p.children
 * @param {string} [p.className]
 */
export function DashboardTab({ selected, onSelect, children, className = "" }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className={`dash-ui-tab cursor-pointer rounded-[10px] border-0 bg-transparent px-3 py-2 text-[0.82rem] font-extrabold text-slate-500 transition-colors hover:bg-white/75 hover:text-slate-700 ${selected ? "dash-ui-tab--selected bg-white text-[color:var(--primary,#2f3b65)] shadow-[0_2px_10px_rgba(15,23,42,0.06)]" : ""} ${className}`.trim()}
      onClick={onSelect}
    >
      {children}
    </button>
  );
}
