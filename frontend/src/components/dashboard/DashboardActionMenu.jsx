/**
 * `<details>` action menu — pass `<summary>…</summary>` and
 * `<div className="dash-ui-action-menu__panel">…</div>` as `children`.
 * @param {{ children: import("react").ReactNode; className?: string }} p
 */
export default function DashboardActionMenu({ children, className = "" }) {
  return (
    <details
      className={
        `dash-ui-action-menu relative inline-block ${className} ` +
        `[&>summary]:list-none [&>summary]:cursor-pointer [&>summary]:rounded-[10px] [&>summary]:border [&>summary]:border-slate-400/35 [&>summary]:bg-white [&>summary]:px-2.5 [&>summary]:py-1.5 [&>summary]:text-[0.82rem] [&>summary]:font-extrabold [&>summary]:text-[color:var(--primary,#2f3b65)] ` +
        `[&>summary::-webkit-details-marker]:hidden ` +
        `[&_.dash-ui-action-menu__panel]:absolute [&_.dash-ui-action-menu__panel]:end-0 [&_.dash-ui-action-menu__panel]:z-[5] [&_.dash-ui-action-menu__panel]:mt-1.5 [&_.dash-ui-action-menu__panel]:min-w-[160px] [&_.dash-ui-action-menu__panel]:rounded-xl [&_.dash-ui-action-menu__panel]:border [&_.dash-ui-action-menu__panel]:border-slate-300/25 [&_.dash-ui-action-menu__panel]:bg-white [&_.dash-ui-action-menu__panel]:p-1.5 [&_.dash-ui-action-menu__panel]:shadow-[0_4px_24px_rgba(15,23,42,0.06)]`.trim()
      }
    >
      {children}
    </details>
  );
}
