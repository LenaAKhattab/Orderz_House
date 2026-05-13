import { useEffect, useMemo, useState } from "react";
import { useHomePageBlocking } from "../context/HomePageBlockingContext";
import usePublicAds from "../hooks/usePublicAds";
import usePublicHomeCategories from "../hooks/usePublicHomeCategories";
import { usePublicHomeStats } from "../hooks/usePublicHomeStats";
import PublicHomePageSkeleton from "../components/skeletons/PublicHomePageSkeleton";
import HomeTopSection from "../components/sections/HomeTopSection";
import CategoriesSection from "../components/sections/CategoriesSection";
import FaqSection from "../components/sections/FaqSection";
import "../components/skeletons/home-skeleton.css";

/** Upper bound so skeleton never blocks real content indefinitely. */
const HOME_BLOCKING_MAX_MS = 3600;

export default function Home() {
  const { setHomeBlocking } = useHomePageBlocking();
  const { ads, loading: adsLoading } = usePublicAds("home_right_panel");
  const { payload: statsPayload, isReady: statsReady } = usePublicHomeStats();
  const { items: categoryItems, loading: categoriesLoading } = usePublicHomeCategories();
  const [maxWait, setMaxWait] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setMaxWait(true), HOME_BLOCKING_MAX_MS);
    return () => window.clearTimeout(t);
  }, []);

  const contentReady = useMemo(
    () => maxWait || (!adsLoading && !categoriesLoading && statsReady),
    [maxWait, adsLoading, categoriesLoading, statsReady],
  );

  useEffect(() => {
    setHomeBlocking(!contentReady);
    return () => setHomeBlocking(false);
  }, [contentReady, setHomeBlocking]);

  return (
    <main className="home-page relative flex min-w-0 w-full flex-1 flex-col bg-page-bg">
      <div className={contentReady ? "relative" : "relative min-h-[100svh]"}>
        {/* Ready: skeleton must leave flow at opacity-0 or it still reserves full skeleton height. */}
        <div
          className={`transition-opacity duration-500 ease-out ${
            contentReady
              ? "pointer-events-none absolute inset-0 z-0 opacity-0"
              : "relative z-0 opacity-100"
          }`}
          aria-hidden={contentReady}
        >
          <PublicHomePageSkeleton />
        </div>
        <div
          className={`transition-opacity duration-500 ease-out ${
            contentReady ? "relative z-[1] opacity-100" : "pointer-events-none absolute inset-x-0 top-0 z-[1] opacity-0"
          }`}
          aria-hidden={!contentReady}
        >
          <div className="home-landing-vp min-w-0">
            <HomeTopSection ads={ads} adsLoading={adsLoading} statsPayload={statsPayload} />
          </div>
          <CategoriesSection items={categoryItems} loading={categoriesLoading} />
          <FaqSection />
        </div>
      </div>
    </main>
  );
}
