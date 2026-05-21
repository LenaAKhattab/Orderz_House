import HubMetricSkeleton from "./HubMetricSkeleton";

export default function DashboardHubTabs({
  tabs,
  activeId,
  onChange,
  scrollable = false,
  ariaLabel,
  alertTabIds = null,
  loading = false,
}) {
  const alertSet = alertTabIds instanceof Set ? alertTabIds : null;
  return (
    <nav
      className={`fdash-tabs${scrollable ? " fdash-tabs--scroll" : ""}`}
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const active = activeId === tab.id;
        const alert = alertSet?.has(tab.id);
        return (
          <button
            key={tab.id}
            type="button"
            className={`fdash-tabs__btn${active ? " fdash-tabs__btn--active" : ""}${alert ? " fdash-tabs__btn--alert" : ""}`}
            onClick={() => onChange(tab.id)}
            aria-pressed={active}
          >
            {tab.icon ? (
              <span className="fdash-tabs__icon" aria-hidden>
                {tab.icon}
              </span>
            ) : null}
            {tab.label}
            {tab.count != null ? (
              loading ? (
                <HubMetricSkeleton variant="count" />
              ) : (
                <span className="fdash-tabs__count">{tab.count}</span>
              )
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
