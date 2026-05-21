import DashboardInsightCard from "./DashboardInsightCard";
import DashboardHubSkeletonCards from "./DashboardHubSkeletonCards";

export default function DashboardInsightsSection({ insights = [], loading = false }) {
  if (!loading && (!insights || insights.length === 0)) {
    return null;
  }

  const items = insights.slice(0, 3);

  return (
    <section className="fdash-insights" aria-labelledby="fdash-insights-heading">
      <h2 id="fdash-insights-heading" className="fdash-insights__title">
        رؤى وتوصيات
      </h2>
      {loading ? (
        <DashboardHubSkeletonCards count={3} />
      ) : (
        <div className="fdash-insights__grid">
          {items.map((item) => (
            <DashboardInsightCard
              key={item.id}
              type={item.type}
              title={item.titleAr}
              description={item.descriptionAr}
              helperText={item.helperText}
              actionUrl={item.actionUrl}
              actionLabel={item.actionLabel}
            />
          ))}
        </div>
      )}
    </section>
  );
}
