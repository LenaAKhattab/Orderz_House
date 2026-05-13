import AdsBandSkeleton from "./AdsBandSkeleton";
import CategoriesSkeleton from "./CategoriesSkeleton";
import FaqSkeleton from "./FaqSkeleton";
import HeroSkeleton from "./HeroSkeleton";
import "./home-skeleton.css";
import "../sections/home-landing-top.css";
import "../ads/home-promo-offers.css";

/**
 * Full homepage skeleton (below real navbar). Mirrors `Home` section shells for stable layout.
 */
export default function PublicHomePageSkeleton() {
  return (
    <div className="home-page-skeleton flex min-w-0 w-full flex-1 flex-col bg-page-bg" aria-busy="true" aria-label="جاري تحميل الصفحة">
      <div className="home-landing-vp min-w-0">
        <section className="home-top-section w-full min-w-0 overflow-x-clip bg-page-bg">
          <div className="home-top-section__inner mx-auto w-full min-w-0 max-w-screen-2xl px-4 pt-4 pb-8 sm:px-6 sm:pt-6 sm:pb-10 lg:px-10 lg:pt-8 lg:pb-12 xl:px-12">
            <div className="home-top-section__hero min-w-0" dir="rtl">
              <div className="hero-container min-w-0 w-full">
                <section className="home-hero home-hero--ref home-hero--marketing w-full min-w-0 overflow-x-clip">
                  <div className="home-hero__inner w-full min-w-0 py-8 md:py-10 lg:py-12">
                    <HeroSkeleton />
                  </div>
                </section>
              </div>
            </div>
            <div className="home-ads-band w-full min-w-0">
              <AdsBandSkeleton />
            </div>
          </div>
        </section>
      </div>
      <CategoriesSkeleton />
      <FaqSkeleton />
    </div>
  );
}
