/**
 * Responsive grid for KPI / stat cards.
 * @param {{ children: import("react").ReactNode; className?: string }} p
 */
export default function DashboardStatsGrid({ children, className = "" }) {
  return (
    <div
      className={`dash-ui-stats-grid grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-4 md:gap-5 ${className}`.trim()}
    >
      {children}
    </div>
  );
}
