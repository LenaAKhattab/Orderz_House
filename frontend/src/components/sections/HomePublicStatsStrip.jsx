import { HOME_PUBLIC_METRICS } from "../../constants/homeAnalyticsMetrics";
import { HomeAnalyticsMetricLabelRow } from "../analytics/HomeAnalyticsMetricInfo";
import { usePublicHomeStats } from "../../hooks/usePublicHomeStats";
import { resolveAnalyticsHint, resolveNumber } from "./heroHomeStatUtils";
import "../analytics/home-analytics-metric-info.css";
import "./home-public-stats.css";

/**
 * Horizontal stats strip below the hero. Cards render only when their Super Admin toggle is ON.
 */
export default function HomePublicStatsStrip() {
  const { payload } = usePublicHomeStats();

  if (payload === null || payload.error) return null;

  const { showVisitorsCount, showActiveUsersCount } = payload;
  if (!showVisitorsCount && !showActiveUsersCount) return null;

  const cards = [];
  if (showVisitorsCount) {
    const m = HOME_PUBLIC_METRICS.views;
    cards.push({
      ...m,
      display: resolveNumber(payload, "views", 0),
      hint: resolveAnalyticsHint(payload, "views"),
    });
  }
  if (showActiveUsersCount) {
    const m = HOME_PUBLIC_METRICS.active;
    cards.push({
      ...m,
      display: resolveNumber(payload, "active", 0),
      hint: resolveAnalyticsHint(payload, "active"),
    });
  }

  return (
    <section className="home-stats-strip" dir="rtl" aria-live="polite">
      <div className="container">
        <div className="home-stats-strip__row">
          {cards.map((card) => (
            <div key={card.key} className={`home-stats-strip__card home-stats-strip__card--${card.tone}`}>
              <div className="home-stats-strip__label">
                <HomeAnalyticsMetricLabelRow label={card.stripLabel} tone={card.tone} showInfo={false} />
              </div>
              <span className="home-stats-strip__value">{card.display}</span>
              <span className="home-stats-strip__sub">{card.sub}</span>
              {card.hint ? <span className="home-stats-strip__hint">{card.hint}</span> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
