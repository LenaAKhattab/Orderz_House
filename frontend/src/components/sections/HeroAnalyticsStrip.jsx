import { HOME_HERO_METRICS_ORDER } from "../../constants/homeAnalyticsMetrics";
import { HomeAnalyticsMetricLabelRow } from "../analytics/HomeAnalyticsMetricInfo";
import { resolveAnalyticsHint } from "./heroHomeStatUtils";
import HeroStatValue from "./HeroStatValue";
import "../analytics/home-analytics-metric-info.css";
import "./home-hero-metrics.css";

/**
 * Hero copy column: platform metrics (minimal layout, no cards).
 * @param {{ statsPayload: object | null }} p
 */
export default function HeroAnalyticsStrip({ statsPayload }) {
  const showGlobalHint =
    statsPayload?.analyticsDegraded || statsPayload?.analyticsMisconfigured;

  return (
    <div
      className="home-hero-analytics home-hero-analytics--minimal home-hero-metrics home-hero-metrics--analytics-only home-hero-metrics--four w-full min-w-0"
      dir="rtl"
      role="group"
      aria-label="إحصائيات المنصة"
    >
      {HOME_HERO_METRICS_ORDER.map((row) => {
        if (statsPayload) {
          if (row.key === "views" && !statsPayload.showVisitorsCount) return null;
          if (row.key === "active" && !statsPayload.showActiveUsersCount) return null;
        }
        const hint = resolveAnalyticsHint(statsPayload, row.key);
        return (
          <div
            key={row.key}
            className={`home-hero-metrics__item home-hero-metrics__item--${row.tone} min-w-0`}
          >
            <div className="home-hero-metrics__label home-hero-analytics__label m-0">
              <HomeAnalyticsMetricLabelRow label={row.label} tone={row.tone} showInfo={false} />
            </div>
            <p className="home-hero-metrics__value home-hero-analytics__value m-0">
              <HeroStatValue statsPayload={statsPayload} metricKey={row.key} />
            </p>
            <p className="home-hero-analytics__metric-sub">{row.sub}</p>
            {hint ? <p className="home-hero-analytics__metric-hint">{hint}</p> : null}
          </div>
        );
      })}
      {showGlobalHint && !HOME_HERO_METRICS_ORDER.some((r) => resolveAnalyticsHint(statsPayload, r.key)) ? (
        <p className="home-hero-analytics__degraded">الإحصائيات غير متاحة حالياً</p>
      ) : null}
    </div>
  );
}
