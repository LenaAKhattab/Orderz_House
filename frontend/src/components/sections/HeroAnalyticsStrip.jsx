import { FALLBACK_DEMO, statDisplayValueAnalytics } from "./heroHomeStatUtils";
import "./home-hero-metrics.css";

/** RTL grid: first column = inline-end (الزوار), second = المستخدمون النشطون */
const HERO_ANALYTICS_METRICS = [
  { key: "views", label: "الزوار", demo: FALLBACK_DEMO.views },
  { key: "active", label: "المستخدمون النشطون", demo: FALLBACK_DEMO.activeUsers },
];

/**
 * Hero copy column: visitors + weekly actives (minimal metrics, no cards).
 * @param {{ statsPayload: object | null }} p
 */
export default function HeroAnalyticsStrip({ statsPayload }) {
  const degraded = Boolean(statsPayload?.analyticsDegraded);

  return (
    <div
      className="home-hero-analytics home-hero-analytics--minimal home-hero-metrics home-hero-metrics--analytics-only w-full min-w-0"
      dir="rtl"
      role="group"
      aria-label="إحصائيات الزوار والمستخدمين النشطين"
    >
      {HERO_ANALYTICS_METRICS.map((row) => (
        <div key={row.key} className="home-hero-metrics__item min-w-0">
          <p className="home-hero-metrics__label home-hero-analytics__label">{row.label}</p>
          <p className="home-hero-metrics__value home-hero-analytics__value">
            {statDisplayValueAnalytics(row, statsPayload)}
          </p>
        </div>
      ))}
      {degraded ? <p className="home-hero-analytics__degraded">البيانات تقديرية</p> : null}
    </div>
  );
}
