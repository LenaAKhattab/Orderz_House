import { useTranslation } from "../../../i18n/LanguageProvider";
import { resolveFreelancerDashboardItem } from "../../../lib/i18n/resolveFreelancerDashboardItem";
import DashboardInsightCard from "./DashboardInsightCard";
import DashboardHubSkeletonCards from "./DashboardHubSkeletonCards";

export default function DashboardInsightsSection({ insights = [], loading = false }) {
  const { t, locale } = useTranslation();

  if (!loading && (!insights || insights.length === 0)) {
    return null;
  }

  const items = insights.slice(0, 3);

  return (
    <section className="fdash-insights" aria-labelledby="fdash-insights-heading">
      <h2 id="fdash-insights-heading" className="fdash-insights__title">
        {t("freelancerDashboard.recommendations.title")}
      </h2>
      {loading ? (
        <DashboardHubSkeletonCards count={3} />
      ) : (
        <div className="fdash-insights__grid">
          {items.map((item) => (
            <DashboardInsightCard
              key={item.id}
              type={item.type}
              title={resolveFreelancerDashboardItem(item, "title", t, locale)}
              description={resolveFreelancerDashboardItem(item, "description", t, locale)}
              helperText={resolveFreelancerDashboardItem(item, "helperText", t, locale)}
              actionUrl={item.actionUrl}
              actionLabel={resolveFreelancerDashboardItem(item, "actionLabel", t, locale)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
