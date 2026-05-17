import HeroMainContent from "./HeroMainContent";
import HomeAdsContainer from "./HomeAdsContainer";
import "./home-hero-ref.css";
import "./home-hero-marketing.css";
import "./home-hero-ipad.css";

/**
 * Hero column: marketing content, inline stats, CTAs, and promo ads on the hero background.
 * @param {{ statsPayload?: object | null; ads?: import("../../types/ad.js").Ad[]; adsLoading?: boolean }} p
 */
export default function HeroContainer({ statsPayload = null, ads = [], adsLoading = false }) {
  return (
    <div className="hero-container min-w-0 w-full">
      <section
        className="home-hero home-hero--ref home-hero--marketing home-hero--premium-stage home-hero--bg-image w-full min-w-0 overflow-x-clip overflow-y-visible"
        dir="rtl"
        data-navbar-hero
        aria-labelledby="home-hero-heading"
      >
        <div className="home-hero__inner w-full min-w-0">
          <HeroMainContent statsPayload={statsPayload} />
          <HomeAdsContainer ads={ads} loading={adsLoading} variant="hero" showTitle={false} />
        </div>
      </section>
    </div>
  );
}
