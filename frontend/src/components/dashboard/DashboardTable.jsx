/**
 * Table chrome only — pass `<thead>` / `<tbody>` (or full table children) as children.
 * @param {object} p
 * @param {import("react").ReactNode} p.children
 * @param {string} [p.caption]
 * @param {string} [p.className]
 */
export default function DashboardTable({ caption, children, className = "" }) {
  return (
    <div className={`dash-ui-table-wrap w-full overflow-x-auto ${className}`.trim()}>
      <table className="dash-ui-table w-full border-collapse text-[0.88rem]" aria-label={caption || undefined}>
        {children}
      </table>
    </div>
  );
}
