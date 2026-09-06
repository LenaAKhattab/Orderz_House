import { HOME_HERO_METRICS_ORDER } from "../../constants/homeAnalyticsMetrics";

import { HomeAnalyticsMetricLabelRow } from "../analytics/HomeAnalyticsMetricInfo";
import HeroStatValue from "./HeroStatValue";
import { shouldRenderHeroStatsSection } from "./heroHomeStatUtils";
import { useTranslation } from "../../i18n/LanguageProvider";

import "../analytics/home-analytics-metric-info.css";

import "./home-hero-metrics.css";



const METRIC_LABEL_KEYS = {

  views: { label: "home.metrics.views", sub: "home.metrics.viewsSub" },

  active: { label: "home.metrics.activeUsers", sub: "home.metrics.activeSub" },

  availableOrders: { label: "home.metrics.availableOrders", sub: "home.metrics.availableSub" },

  completedOrders: { label: "home.metrics.completedOrders", sub: "home.metrics.completedSub" },

};



const HINT_KEYS = {

  zero_traffic_views: "home.metrics.zeroViews",

  zero_traffic_active: "home.metrics.zeroActive",

  db_unavailable: "home.metrics.dbUnavailable",

  dev_tracking_disabled: "home.metrics.devTrackingDisabled",

};



function mapHint(t, payload, key) {

  const reason = key === "views" ? payload?.visitorsReason : key === "active" ? payload?.activeUsersReason : null;

  if (reason === "zero_traffic") {

    return key === "views" ? t(HINT_KEYS.zero_traffic_views) : t(HINT_KEYS.zero_traffic_active);

  }

  if (reason && HINT_KEYS[reason]) return t(HINT_KEYS[reason]);

  if (payload?.analyticsDegraded) return t(HINT_KEYS.db_unavailable);
  return null;
}



/**

 * Hero copy column: platform metrics (minimal layout, no cards).
 * Hidden entirely when the public stats request fails or order counts are invalid.

 * @param {{ statsPayload: object | null }} p

 */

export default function HeroAnalyticsStrip({ statsPayload }) {

  const { t, dir } = useTranslation();

  if (!shouldRenderHeroStatsSection(statsPayload)) {
    return null;
  }

  const showGlobalHint =

    statsPayload?.analyticsDegraded || statsPayload?.analyticsMisconfigured;



  return (

    <div

      className="home-hero-analytics home-hero-analytics--minimal home-hero-metrics home-hero-metrics--analytics-only home-hero-metrics--four w-full min-w-0"

      dir={dir}

      role="group"

      aria-label={t("home.metrics.statsAria")}

      data-testid="home-hero-stats"

    >

      {HOME_HERO_METRICS_ORDER.map((row) => {

        if (statsPayload) {

          if (row.key === "views" && !statsPayload.showVisitorsCount) return null;

          if (row.key === "active" && !statsPayload.showActiveUsersCount) return null;

        }

        const keys = METRIC_LABEL_KEYS[row.key] || { label: row.label, sub: row.sub };

        const hint = mapHint(t, statsPayload, row.key);

        return (

          <div

            key={row.key}

            className={`home-hero-metrics__item home-hero-metrics__item--${row.tone} min-w-0`}

          >

            <div className="home-hero-metrics__label home-hero-analytics__label m-0">

              <HomeAnalyticsMetricLabelRow label={t(keys.label)} tone={row.tone} showInfo={false} />

            </div>

            <p className="home-hero-metrics__value home-hero-analytics__value m-0">

              <HeroStatValue statsPayload={statsPayload} metricKey={row.key} />

            </p>

            <p className="home-hero-analytics__metric-sub">{t(keys.sub)}</p>

            {hint ? <p className="home-hero-analytics__metric-hint">{hint}</p> : null}

          </div>

        );

      })}

      {showGlobalHint && !HOME_HERO_METRICS_ORDER.some((r) => mapHint(t, statsPayload, r.key)) ? (

        <p className="home-hero-analytics__degraded">{t("home.metrics.degraded")}</p>

      ) : null}

    </div>

  );

}

