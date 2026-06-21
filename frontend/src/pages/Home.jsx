import usePublicAds from "../hooks/usePublicAds";
import usePublicPoolOrdersPreview from "../hooks/usePublicPoolOrdersPreview";
import { usePublicHomeStats } from "../hooks/usePublicHomeStats";
import { HOME_MOBILE_ORDERS_PREVIEW_LIMIT } from "../utils/homeMobileOrderCards";
import HomeTopSection from "../components/sections/HomeTopSection";
import CategoriesSection from "../components/sections/CategoriesSection";
import FaqSection from "../components/sections/FaqSection";
import HomeMobilePage from "../components/sections/mobile/HomeMobilePage";
import "../components/sections/home-landing-top.css";
import "../components/sections/mobile/home-mobile-page.css";

/**
 * Public homepage — desktop layout + radical mobile-only layout (≤640px).
 */
export default function Home() {
  const { ads, loading: adsLoading } = usePublicAds("home_right_panel");
  const { payload: statsPayload } = usePublicHomeStats();
  const {
    items: recentOrders,
    loading: recentOrdersLoading,
    error: recentOrdersError,
  } = usePublicPoolOrdersPreview({ limit: HOME_MOBILE_ORDERS_PREVIEW_LIMIT });

  return (
    <main className="home-page relative flex min-w-0 w-full flex-1 flex-col bg-transparent">
      <div className="home-desktop-only">
        <div className="home-landing-vp min-w-0 home-landing-vp--ready">
          <HomeTopSection ads={ads} adsLoading={adsLoading} statsPayload={statsPayload} />
        </div>
        <CategoriesSection />
        <FaqSection />
      </div>

      <HomeMobilePage
        ads={ads}
        adsLoading={adsLoading}
        statsPayload={statsPayload}
        recentOrders={recentOrders}
        recentOrdersLoading={recentOrdersLoading}
        recentOrdersError={recentOrdersError}
      />
    </main>
  );
}
