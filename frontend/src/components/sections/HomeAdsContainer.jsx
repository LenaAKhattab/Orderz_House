import HomePromoOffersSection from "../ads/HomePromoOffersSection";
import AdsBandSkeleton from "../skeletons/AdsBandSkeleton";
import "../ads/home-promo-offers.css";

/**
 * Homepage offers band below the hero (full width, responsive grid). Same placement + API as before.
 * @param {{ ads?: import("../../../types/ad.js").Ad[]; loading?: boolean }} p
 */
export default function HomeAdsContainer({ ads = [], loading = false }) {
  const hasAds = Array.isArray(ads) && ads.length > 0;

  if (!loading && !hasAds) {
    return null;
  }

  if (loading) {
    return (
      <div className="home-ads-band w-full min-w-0" aria-busy="true" aria-label="جاري تحميل الإعلانات">
        <AdsBandSkeleton />
      </div>
    );
  }

  return (
    <div className="home-ads-band w-full min-w-0">
      <HomePromoOffersSection ads={ads} placement="home_right_panel" />
    </div>
  );
}
