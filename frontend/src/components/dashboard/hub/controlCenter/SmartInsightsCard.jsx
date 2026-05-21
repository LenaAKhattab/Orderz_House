import { Link } from "react-router-dom";

export default function SmartInsightsCard({ insights = [], loading }) {
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
        رؤى وتوصيات
      </h2>
      <ul className="fdash-growth-insights__list">
        {insights.map((item) => (
          <li key={item.id} className={`fdash-growth-insights__item fdash-growth-insights__item--p${item.priority}`}>
            <div className="fdash-growth-insights__copy">
              <h3 className="fdash-growth-insights__item-title">{item.titleAr}</h3>
              <p className="fdash-growth-insights__item-desc">{item.descriptionAr}</p>
            </div>
            {item.actionUrl && item.actionLabel ? (
              <Link to={item.actionUrl} className="fdash-cc-btn fdash-cc-btn--sm fdash-cc-btn--ghost">
                {item.actionLabel}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
