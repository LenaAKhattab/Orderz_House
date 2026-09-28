import { useTranslation } from "../../../i18n/LanguageProvider";
import "../../../i18n/opsAdminResources";
import "../home-analytics-metric-info.css";

export default function HomeMetricsAdminExplainer() {
  const { t } = useTranslation();
  const hp = "opsAdmin.homePublicStats";
  return (
    <aside className="sa-home-metrics-explainer" aria-label={t(`${hp}.metricsExplainerAria`)}>
      <h3 className="sa-home-metrics-explainer__title">{t(`${hp}.helpTitle`)}</h3>
      <ul className="sa-home-metrics-explainer__list">
        <li className="sa-home-metrics-explainer__item sa-home-metrics-explainer__item--visitors">
          <strong>{t("home.metrics.views")}</strong>
          <p>{t(`${hp}.helpVisitors`)}</p>
        </li>
        <li className="sa-home-metrics-explainer__item sa-home-metrics-explainer__item--active">
          <strong>{t("home.metrics.activeUsers")}</strong>
          <p>{t(`${hp}.helpActive`)}</p>
        </li>
      </ul>
    </aside>
  );
}
