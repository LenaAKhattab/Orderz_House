/**
 * Toolbar row — compose with children (search, filters, buttons).
 * @param {{ children: import("react").ReactNode; className?: string }} p
 */
export default function DashboardToolbar({ children, className = "" }) {
  return (
    <div
      className={`dash-ui-toolbar mb-5 flex w-full min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 ${className}`.trim()}
    >
      {children}
    </div>
  );
}
