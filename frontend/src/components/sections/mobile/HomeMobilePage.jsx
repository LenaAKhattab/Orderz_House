import HomeMobileHero from "./HomeMobileHero";
import HomeMobileCategories from "./HomeMobileCategories";
import HomeMobileFaq from "./HomeMobileFaq";
import HomeMobilePartners from "./HomeMobilePartners";
import { useTranslation } from "../../../i18n/LanguageProvider";
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
  const { dir } = useTranslation();

  return (
    <div className="home-mobile-page" dir={dir}>
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
