import { HOME_METRICS_ADMIN_EXPLAINER } from "../../../constants/homeAnalyticsMetrics";
import "../home-analytics-metric-info.css";

export default function HomeMetricsAdminExplainer() {
  const x = HOME_METRICS_ADMIN_EXPLAINER;
  return (
    <aside className="sa-home-metrics-explainer" aria-label="شرح مؤشرات الصفحة الرئيسية">
      <h3 className="sa-home-metrics-explainer__title">{x.title}</h3>
      <ul className="sa-home-metrics-explainer__list">
        <li className="sa-home-metrics-explainer__item sa-home-metrics-explainer__item--visitors">
          <strong>{x.visitors.term}</strong>
          <p>{x.visitors.body}</p>
        </li>
        <li className="sa-home-metrics-explainer__item sa-home-metrics-explainer__item--active">
          <strong>{x.active.term}</strong>
          <p>{x.active.body}</p>
        </li>
      </ul>
      <p className="sa-home-metrics-explainer__note">{x.whyDiffer}</p>
      <p className="sa-home-metrics-explainer__note">{x.note}</p>
    </aside>
  );
}
