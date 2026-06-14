import { Link } from "react-router-dom";
import { HOME_HERO_METRICS_ORDER } from "../../../constants/homeAnalyticsMetrics";
import HomePromoOffersSection from "../../ads/HomePromoOffersSection";
import AdsBandSkeleton from "../../skeletons/AdsBandSkeleton";
import HeroStatValue from "../HeroStatValue";
import { resolveAnalyticsHint } from "../heroHomeStatUtils";
import HomeMobileHeroMastheadArt from "./HomeMobileHeroMastheadArt";
import "../../ads/home-promo-offers.css";

const HERO_METRICS = HOME_HERO_METRICS_ORDER;

const DEFAULT_FEATURED = [
  {
    id: "start-order",
    title: "ابدأ طلبك بسهولة",
    tag: "خطوة واحدة",
    to: "/register",
    tone: "dark",
  },
  {
    id: "explore-services",
    title: "قارن الخدمات المتاحة",
    tag: "استكشف",
    to: "/services",
    tone: "accent",
  },
];

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
  const showAds = adsLoading || (Array.isArray(ads) && ads.length > 0);

  return (
    <section className="hm-hero" dir="rtl" aria-labelledby="hm-hero-heading">
      <div className="hm-hero__masthead">
        <HomeMobileHeroMastheadArt />
        <header className="hm-hero__top">
          <div className="hm-hero__greeting">
            <p className="hm-hero__greeting-label">مرحباً بك في</p>
            <h1 id="hm-hero-heading" className="hm-hero__greeting-title">
              أوردرز هاوس
            </h1>
          </div>
        </header>
      </div>

      <Link to="/services" className="hm-hero__search" aria-label="البحث عن خدمة">
        <SearchIcon />
        <span>ابحث عن خدمة أو تصنيف...</span>
      </Link>

      <div className="hm-hero__intro">
        <h2 className="hm-hero__headline">منصة واحدة تجمعك بالخدمات والمستقلين المناسبين</h2>
        <p className="hm-hero__subline">
          ابدأ بطلبك بسهولة، قارن الخدمات المتاحة، وتابع كل خطوة من مكان واحد.
        </p>
      </div>

      <div className="hm-hero__featured" aria-label="ابدأ من هنا">
        <div className="hm-hero__featured-track">
          {DEFAULT_FEATURED.map((item) => (
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

      <div className="hm-hero__stats" role="group" aria-label="إحصائيات المنصة">
        {HERO_METRICS.map((row) => {
          if (statsPayload) {
            if (row.key === "views" && !statsPayload.showVisitorsCount) return null;
            if (row.key === "active" && !statsPayload.showActiveUsersCount) return null;
          }
          const hint = resolveAnalyticsHint(statsPayload, row.key);
          return (
            <div key={row.key} className={`hm-stat-pill hm-stat-pill--${row.tone}`}>
              <span className="hm-stat-pill__label">{row.label}</span>
              <span className="hm-stat-pill__value">
                <HeroStatValue statsPayload={statsPayload} metricKey={row.key} />
              </span>
              <span className="hm-stat-pill__sub">{row.sub}</span>
              {hint ? <span className="hm-stat-pill__hint">{hint}</span> : null}
            </div>
          );
        })}
      </div>

      {showAds ? (
        <div className="hm-hero__ads" aria-label="إعلانات">
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
