/**
 * Table chrome only — pass `<thead>` / `<tbody>` (or full table children) as children.
 * @param {object} p
 * @param {import("react").ReactNode} p.children
 * @param {string} [p.caption]
 * @param {string} [p.className]
 */
export default function DashboardTable({ caption, children, className = "" }) {
  return (
    <div
      className={`dash-ui-table-wrap w-full overflow-x-auto rounded-xl border border-slate-300/25 bg-white ${className}`.trim()}
    >
      <table
        className={
          `dash-ui-table w-full border-collapse text-[0.88rem] ` +
          `[&_thead_th]:border-b [&_thead_th]:border-slate-200/95 [&_thead_th]:bg-slate-50/95 [&_thead_th]:px-3 [&_thead_th]:py-2.5 [&_thead_th]:text-start [&_thead_th]:font-extrabold [&_thead_th]:text-slate-600 ` +
          `[&_tbody_td]:border-b [&_tbody_td]:border-slate-100/95 [&_tbody_td]:px-3 [&_tbody_td]:py-2.5 [&_tbody_td]:text-slate-800 ` +
          `[&_tbody_tr:last-child_td]:border-b-0`.trim()
        }
        aria-label={caption || undefined}
      >
        {children}
      </table>
    </div>
  );
}
