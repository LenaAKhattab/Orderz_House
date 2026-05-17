import HomePromoOffersSection from "../ads/HomePromoOffersSection";
import AdsBandSkeleton from "../skeletons/AdsBandSkeleton";
import "../ads/home-promo-offers.css";

/**
 * Homepage promo ads — default band or inline inside hero (`variant="hero"`).
 * @param {{ ads?: import("../../types/ad.js").Ad[]; loading?: boolean; variant?: "default"|"hero"; showTitle?: boolean }} p
 */
export default function HomeAdsContainer({ ads = [], loading = false, variant = "default", showTitle = true }) {
  const hasAds = Array.isArray(ads) && ads.length > 0;
  const isHero = variant === "hero";
  const wrapClass = isHero ? "home-hero__ads hero-inline-ads w-full min-w-0" : "home-ads-band w-full min-w-0";

  if (!loading && !hasAds) {
    return null;
  }

  if (loading) {
    return (
      <div className={wrapClass} aria-busy="true" aria-label="جاري تحميل الإعلانات">
        <AdsBandSkeleton variant={isHero ? "hero" : "default"} />
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      <HomePromoOffersSection
        ads={ads}
        placement="home_right_panel"
        variant={variant}
        showTitle={showTitle}
      />
    </div>
  );
}
