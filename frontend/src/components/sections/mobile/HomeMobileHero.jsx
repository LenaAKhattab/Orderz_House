import { Link } from "react-router-dom";
import { useMemo } from "react";
import { HOME_HERO_METRICS_ORDER } from "../../../constants/homeAnalyticsMetrics";
import HomePromoOffersSection from "../../ads/HomePromoOffersSection";
import AdsBandSkeleton from "../../skeletons/AdsBandSkeleton";
import HeroStatValue from "../HeroStatValue";
import { shouldRenderHeroStatsSection } from "../heroHomeStatUtils";
import HomeMobileHeroMastheadArt from "./HomeMobileHeroMastheadArt";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "../../ads/home-promo-offers.css";

const METRIC_LABEL_KEYS = {
  views: { label: "home.metrics.views", sub: "home.metrics.viewsSub" },
  active: { label: "home.metrics.activeUsers", sub: "home.metrics.activeSub" },
  availableOrders: { label: "home.metrics.availableOrders", sub: "home.metrics.availableSub" },
  completedOrders: { label: "home.metrics.completedOrders", sub: "home.metrics.completedSub" },
};

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

/**
 * Mobile-only hero — greeting, search, featured CTAs, stats, admin-designed promo ads.
 * @param {{ statsPayload: object | null; ads?: import("../../../types/ad.js").Ad[]; adsLoading?: boolean }} p
 */
export default function HomeMobileHero({ statsPayload, ads = [], adsLoading = false }) {
  const { t, dir, isRtl } = useTranslation();
  const showAds = adsLoading || (Array.isArray(ads) && ads.length > 0);

  const featured = useMemo(
    () => [
      {
        id: "register-client",
        title: t("home.hero.featured.startOrder"),
        tag: t("home.hero.featured.startOrderTag"),
        to: "/register?role=client",
        tone: "dark",
      },
      {
        id: "register-freelancer",
        title: t("home.hero.featured.exploreServices"),
        tag: t("home.hero.featured.exploreTag"),
        to: "/register?role=freelancer",
        tone: "accent",
      },
    ],
    [t],
  );

  return (
    <section className="hm-hero" dir={dir} aria-labelledby="hm-hero-heading">
      <div className="hm-hero__masthead">
        <HomeMobileHeroMastheadArt />
        <header className="hm-hero__top">
          <div className="hm-hero__greeting">
            <p className="hm-hero__greeting-label">{t("home.hero.greeting")}</p>
            <h1 id="hm-hero-heading" className="hm-hero__greeting-title">
              {t("common.brand")}
            </h1>
          </div>
        </header>
      </div>

      <Link to="/services" className="hm-hero__search" aria-label={t("home.hero.searchAria")}>
        <SearchIcon />
        <span>{t("home.hero.searchPlaceholder")}</span>
      </Link>

      <div className="hm-hero__intro">
        <h2 className="hm-hero__headline">{t("home.hero.title")}</h2>
        <p className="hm-hero__subline">{t("home.hero.leadShort")}</p>
      </div>

      <div className="hm-hero__cta-wrap">
        <Link to="/orders" className="home-hero-mobile-start-cta">
          <span className="home-hero-mobile-start-cta__label">{t("home.hero.browseServicesNow")}</span>
          <span className="home-hero-mobile-start-cta__icon" aria-hidden="true">
            {isRtl ? "←" : "→"}
          </span>
        </Link>
      </div>

      <div className="hm-hero__featured" aria-label={t("home.hero.featuredAria")}>
        <div className="hm-hero__featured-track">
          {featured.map((item) => (
            <Link
              key={item.id}
              to={item.to}
              className={`hm-featured-card hm-featured-card--${item.tone}`}
            >
              <span className="hm-featured-card__title">{item.title}</span>
              <span className="hm-featured-card__footer">
                <span className="hm-featured-card__tag">{item.tag}</span>
                <span className="hm-featured-card__play">
                  <PlayIcon />
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>

      {shouldRenderHeroStatsSection(statsPayload) ? (
        <div
          className="hm-hero__stats"
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
            return (
              <div key={row.key} className={`hm-stat-pill hm-stat-pill--${row.tone}`}>
                <span className="hm-stat-pill__label">{t(keys.label)}</span>
                <span className="hm-stat-pill__value">
                  <HeroStatValue statsPayload={statsPayload} metricKey={row.key} />
                </span>
                <span className="hm-stat-pill__sub">{t(keys.sub)}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {showAds ? (
        <div className="hm-hero__ads" aria-label={t("home.hero.adsAria")}>
          {adsLoading ? (
            <AdsBandSkeleton variant="hero" />
          ) : (
            <HomePromoOffersSection ads={ads} placement="home_right_panel" showTitle={false} variant="hero" />
          )}
        </div>
      ) : null}
    </section>
  );
}
