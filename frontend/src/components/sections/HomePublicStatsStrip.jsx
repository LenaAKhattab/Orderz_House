import { HOME_PUBLIC_METRICS } from "../../constants/homeAnalyticsMetrics";
import { HomeAnalyticsMetricLabelRow } from "../analytics/HomeAnalyticsMetricInfo";
import { usePublicHomeStats } from "../../hooks/usePublicHomeStats";
import { useTranslation } from "../../i18n/LanguageProvider";
import { resolveNumber } from "./heroHomeStatUtils";
import "../analytics/home-analytics-metric-info.css";
import "./home-public-stats.css";

/**
 * Horizontal stats strip below the hero. Cards render only when their Super Admin toggle is ON.
 */
const HINT_KEYS = {
  zero_traffic_views: "home.metrics.zeroViews",
  zero_traffic_active: "home.metrics.zeroActive",
  db_unavailable: "home.metrics.dbUnavailable",
  dev_tracking_disabled: "home.metrics.devTrackingDisabled",
};

function localizedHint(t, payload, key) {
  const reason = key === "views" ? payload?.visitorsReason : key === "active" ? payload?.activeUsersReason : null;
  if (reason === "zero_traffic") {
    return key === "views" ? t(HINT_KEYS.zero_traffic_views) : t(HINT_KEYS.zero_traffic_active);
  }
  if (reason && HINT_KEYS[reason]) return t(HINT_KEYS[reason]);
  if (payload?.analyticsDegraded) return t(HINT_KEYS.db_unavailable);
  return null;
}

export default function HomePublicStatsStrip() {
  const { t, dir } = useTranslation();
  const { payload } = usePublicHomeStats();

  if (payload === null || payload.error) return null;

  const { showVisitorsCount, showActiveUsersCount } = payload;
  if (!showVisitorsCount && !showActiveUsersCount) return null;

  const cards = [];
  if (showVisitorsCount) {
    const m = HOME_PUBLIC_METRICS.views;
    cards.push({
      key: m.key,
      tone: m.tone,
      stripLabel: t("home.metrics.views"),
      sub: t("home.metrics.viewsSub"),
      display: resolveNumber(payload, "views"),
      hint: localizedHint(t, payload, "views"),
    });
  }
  if (showActiveUsersCount) {
    const m = HOME_PUBLIC_METRICS.active;
    cards.push({
      key: m.key,
      tone: m.tone,
      stripLabel: t("home.metrics.activeUsers"),
      sub: t("home.metrics.activeSub"),
      display: resolveNumber(payload, "active"),
      hint: localizedHint(t, payload, "active"),
    });
  }

  return (
    <section className="home-stats-strip" dir={dir} aria-live="polite">
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
