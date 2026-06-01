/**
 * Tab list container — compose with `DashboardTab` children.
 * @param {{ "aria-label"?: string; children: import("react").ReactNode; className?: string }} p
 */
export default function DashboardTabs({ "aria-label": ariaLabel = "أقسام", children, className = "" }) {
  return (
    <div className={`dash-ui-tabs flex flex-wrap gap-1.5 ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
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
      className={`dash-ui-tab cursor-pointer border-0 bg-transparent px-3 py-2 text-[0.82rem] font-extrabold transition-colors ${selected ? "dash-ui-tab--selected" : ""} ${className}`.trim()}
      onClick={onSelect}
    >
      {children}
    </button>
  );
}
