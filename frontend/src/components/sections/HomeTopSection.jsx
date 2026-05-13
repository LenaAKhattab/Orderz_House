import HeroContainer from "./HeroContainer";
import HomeAdsContainer from "./HomeAdsContainer";
import "./home-landing-top.css";

/**
 * Landing shell: hero full width, then offers grid band (no sidebar rail).
 * @param {{ ads?: import("../../types/ad.js").Ad[]; adsLoading?: boolean; statsPayload?: object | null }} p
 */
export default function HomeTopSection({ ads = [], adsLoading = false, statsPayload = null }) {
  return (
    <section
      className="home-top-section w-full min-w-0 overflow-x-clip bg-page-bg"
      aria-label="المقدمة والعروض"
    >
      <div className="home-top-section__inner mx-auto w-full min-w-0 max-w-screen-2xl px-4 pt-4 pb-8 sm:px-6 sm:pt-6 sm:pb-10 lg:px-10 lg:pt-8 lg:pb-12 xl:px-12">
        <div className="home-top-section__hero min-w-0" dir="rtl">
          <HeroContainer statsPayload={statsPayload} />
        </div>
        <HomeAdsContainer ads={ads} loading={adsLoading} />
      </div>
    </section>
  );
}
