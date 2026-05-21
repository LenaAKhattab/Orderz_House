import HubMetricSkeleton from "./HubMetricSkeleton";

export default function DashboardHubStats({ items, columns = 4, loading = false, ariaLabel }) {
  const gridClass =
    columns === 6
      ? "fdash-stats fdash-stats--6"
      : columns === 5
        ? "fdash-stats fdash-stats--5"
        : "fdash-stats";
  return (
    <div className={gridClass} aria-label={ariaLabel}>
      {items.map((item) => (
        <div key={item.id} className={`fdash-stat fdash-stat--${item.tone || "blue"}`}>
          <span className="fdash-stat__icon" aria-hidden>
            {item.icon}
          </span>
          <div>
            {loading ? (
              <HubMetricSkeleton variant="stat" />
            ) : (
              <strong className="fdash-stat__value">{item.value}</strong>
            )}
            <span className="fdash-stat__label">{item.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
