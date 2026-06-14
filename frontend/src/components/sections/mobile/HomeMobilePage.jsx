import HomeMobileHero from "./HomeMobileHero";
import HomeMobileCategories from "./HomeMobileCategories";
import HomeMobileFaq from "./HomeMobileFaq";
import HomeMobilePartners from "./HomeMobilePartners";
import "./home-mobile-page.css";

/**
 * Radical mobile-only homepage layout (≤640px). Hidden on desktop via CSS.
 * @param {{
 *   ads?: import("../../../types/ad.js").Ad[];
 *   adsLoading?: boolean;
 *   statsPayload?: object | null;
 *   recentOrders?: unknown[];
 *   recentOrdersLoading?: boolean;
 *   recentOrdersError?: boolean;
 * }} p
 */
export default function HomeMobilePage({
  ads = [],
  adsLoading = false,
  statsPayload = null,
  recentOrders = [],
  recentOrdersLoading = false,
  recentOrdersError = false,
}) {
  return (
    <div className="home-mobile-page" dir="rtl">
      <HomeMobileHero statsPayload={statsPayload} ads={ads} adsLoading={adsLoading} />
      <HomeMobileCategories
        recentOrders={recentOrders}
        recentOrdersLoading={recentOrdersLoading}
        recentOrdersError={recentOrdersError}
      />
      <HomeMobileFaq />
      <HomeMobilePartners />
    </div>
  );
}
