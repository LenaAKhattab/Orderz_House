import { HOME_PUBLIC_METRICS } from "../../constants/homeAnalyticsMetrics";
import { HomeAnalyticsMetricLabelRow } from "../analytics/HomeAnalyticsMetricInfo";
import { FALLBACK_DEMO, resolveAnalyticsHint, statDisplayValueAnalytics } from "./heroHomeStatUtils";
import "../analytics/home-analytics-metric-info.css";
import "./home-hero-metrics.css";

const HERO_ANALYTICS_METRICS = [
  { ...HOME_PUBLIC_METRICS.views, demo: FALLBACK_DEMO.views },
  { ...HOME_PUBLIC_METRICS.active, demo: FALLBACK_DEMO.activeUsers },
];

/**
 * Hero copy column: visitors + weekly actives (minimal metrics, no cards).
 * @param {{ statsPayload: object | null }} p
 */
export default function HeroAnalyticsStrip({ statsPayload }) {
  const showGlobalHint =
    statsPayload?.analyticsDegraded || statsPayload?.analyticsMisconfigured;

  return (
    <div
      className="home-hero-analytics home-hero-analytics--minimal home-hero-metrics home-hero-metrics--analytics-only w-full min-w-0"
      dir="rtl"
      role="group"
      aria-label="إحصائيات زوار الموقع والمستخدمين المتفاعلين — آخر 7 أيام"
    >
      {HERO_ANALYTICS_METRICS.map((row) => {
        const hint = resolveAnalyticsHint(statsPayload, row.key);
        return (
          <div
            key={row.key}
            className={`home-hero-metrics__item home-hero-metrics__item--${row.tone} min-w-0`}
          >
            <div className="home-hero-metrics__label home-hero-analytics__label m-0">
              <HomeAnalyticsMetricLabelRow label={row.label} tone={row.tone} showInfo={false} />
            </div>
            <p className="home-hero-metrics__value home-hero-analytics__value">
              {statDisplayValueAnalytics(row, statsPayload)}
            </p>
            <p className="home-hero-analytics__metric-sub">{row.sub}</p>
            {hint ? <p className="home-hero-analytics__metric-hint">{hint}</p> : null}
          </div>
        );
      })}
      {showGlobalHint && !HERO_ANALYTICS_METRICS.some((r) => resolveAnalyticsHint(statsPayload, r.key)) ? (
        <p className="home-hero-analytics__degraded">الإحصائيات غير متاحة حالياً</p>
      ) : null}
    </div>
  );
}
