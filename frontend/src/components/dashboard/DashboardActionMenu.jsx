import { forwardRef } from "react";

/**
 * `<details>` action menu — pass `<summary>…</summary>` and
 * `<div className="dash-ui-action-menu__panel">…</div>` as `children`.
 * @param {{ children: import("react").ReactNode; className?: string }} p
 */
const DashboardActionMenu = forwardRef(function DashboardActionMenu({ children, className = "" }, ref) {
  return (
    <details
      ref={ref}
      className={
        `dash-ui-action-menu relative inline-block ${className} ` +
        `[&>summary]:list-none [&>summary]:cursor-pointer [&>summary]:rounded-[10px] [&>summary]:border [&>summary]:border-[color:var(--dash-border-interactive,#a9b4c3)] [&>summary]:bg-[color:var(--dash-input,#fff)] [&>summary]:px-2.5 [&>summary]:py-1.5 [&>summary]:text-[0.82rem] [&>summary]:font-extrabold [&>summary]:text-[color:var(--dash-primary,#2f3b65)] ` +
        `[&>summary::-webkit-details-marker]:hidden ` +
        `[&_.dash-ui-action-menu__panel]:absolute [&_.dash-ui-action-menu__panel]:end-0 [&_.dash-ui-action-menu__panel]:z-[5] [&_.dash-ui-action-menu__panel]:mt-1.5 [&_.dash-ui-action-menu__panel]:min-w-[160px] [&_.dash-ui-action-menu__panel]:rounded-xl [&_.dash-ui-action-menu__panel]:border [&_.dash-ui-action-menu__panel]:border-[color:var(--dash-border,#c9d0da)] [&_.dash-ui-action-menu__panel]:bg-[color:var(--dash-card,#fcfcfd)] [&_.dash-ui-action-menu__panel]:p-1.5 [&_.dash-ui-action-menu__panel]:shadow-[var(--dash-shadow-md)]`.trim()
      }
    >
      {children}
    </details>
  );
});

export default DashboardActionMenu;
