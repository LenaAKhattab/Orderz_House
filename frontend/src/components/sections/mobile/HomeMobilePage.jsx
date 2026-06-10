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
 *   categoryItems?: unknown[];
 *   categoriesLoading?: boolean;
 *   categoriesError?: boolean;
 *   recentOrders?: unknown[];
 *   recentOrdersLoading?: boolean;
 *   recentOrdersError?: boolean;
 * }} p
 */
export default function HomeMobilePage({
  ads = [],
  adsLoading = false,
  statsPayload = null,
  categoryItems = [],
  categoriesLoading = false,
  categoriesError = false,
  recentOrders = [],
  recentOrdersLoading = false,
  recentOrdersError = false,
}) {
  return (
    <div className="home-mobile-page" dir="rtl">
      <HomeMobileHero statsPayload={statsPayload} ads={ads} adsLoading={adsLoading} />
      <HomeMobileCategories
        items={categoryItems}
        loading={categoriesLoading}
        error={categoriesError}
        recentOrders={recentOrders}
        recentOrdersLoading={recentOrdersLoading}
        recentOrdersError={recentOrdersError}
      />
      <HomeMobileFaq />
      <HomeMobilePartners />
    </div>
  );
}
