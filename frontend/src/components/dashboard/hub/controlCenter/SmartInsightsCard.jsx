import { Link } from "react-router-dom";
import { useTranslation } from "../../../../i18n/LanguageProvider";
import { resolveFreelancerDashboardItem } from "../../../../lib/i18n/resolveFreelancerDashboardItem";

export default function SmartInsightsCard({ insights = [], loading }) {
  const { t, locale } = useTranslation();

  if (loading) {
    return (
      <section className="fdash-growth-insights fdash-growth-insights--loading">
        <div className="fdash-cc-skel" style={{ height: 72 }} />
      </section>
    );
  }

  if (!insights.length) return null;

  return (
    <section className="fdash-growth-insights" aria-labelledby="fdash-insights-heading">
      <h2 id="fdash-insights-heading" className="fdash-growth-insights__title">
        {t("freelancerDashboard.recommendations.title")}
      </h2>
      <ul className="fdash-growth-insights__list">
        {insights.map((item) => (
          <li key={item.id} className={`fdash-growth-insights__item fdash-growth-insights__item--p${item.priority}`}>
            <div className="fdash-growth-insights__copy">
              <h3 className="fdash-growth-insights__item-title">{resolveFreelancerDashboardItem(item, "title", t, locale)}</h3>
              <p className="fdash-growth-insights__item-desc">{resolveFreelancerDashboardItem(item, "description", t, locale)}</p>
            </div>
            {item.actionUrl && resolveFreelancerDashboardItem(item, "actionLabel", t, locale) ? (
              <Link to={item.actionUrl} className="fdash-cc-btn fdash-cc-btn--sm fdash-cc-btn--ghost">
                {resolveFreelancerDashboardItem(item, "actionLabel", t, locale)}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
