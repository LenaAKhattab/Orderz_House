import HeroMainContent from "./HeroMainContent";
import "./home-hero-ref.css";
import "./home-hero-marketing.css";
import "./home-hero-ipad.css";
import "./home-hero-ipad-mockup.css";

/**
 * Hero column: marketing content, illustration, and inline stats (see HeroMainContent).
 * @param {{ statsPayload?: object | null }} p
 */
export default function HeroContainer({ statsPayload = null }) {
  return (
    <div className="hero-container min-w-0 w-full">
      <section
        className="home-hero home-hero--ref home-hero--marketing home-hero--premium-stage w-full min-w-0 overflow-x-clip"
        dir="rtl"
        data-navbar-hero
        aria-labelledby="home-hero-heading"
      >
        <div className="home-hero__inner w-full min-w-0 py-8 md:py-10 lg:py-12">
          <HeroMainContent statsPayload={statsPayload} />
        </div>
      </section>
    </div>
  );
}
