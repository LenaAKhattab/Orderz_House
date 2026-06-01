import usePublicAds from "../hooks/usePublicAds";
import usePublicHomeCategories from "../hooks/usePublicHomeCategories";
import { usePublicHomeStats } from "../hooks/usePublicHomeStats";
import HomeTopSection from "../components/sections/HomeTopSection";
import CategoriesSection from "../components/sections/CategoriesSection";
import FaqSection from "../components/sections/FaqSection";
import "../components/sections/home-landing-top.css";

/**
 * Public homepage — hero renders immediately; below-fold sections hydrate progressively.
 */
export default function Home() {
  const { ads, loading: adsLoading } = usePublicAds("home_right_panel");
  const { payload: statsPayload } = usePublicHomeStats();
  const { items: categoryItems, loading: categoriesLoading, error: categoriesError } = usePublicHomeCategories();

  return (
    <main className="home-page relative flex min-w-0 w-full flex-1 flex-col bg-transparent">
      <div className="home-landing-vp min-w-0 home-landing-vp--ready">
        <HomeTopSection ads={ads} adsLoading={adsLoading} statsPayload={statsPayload} />
      </div>
      <CategoriesSection items={categoryItems} loading={categoriesLoading} error={categoriesError} />
      <FaqSection />
    </main>
  );
}
