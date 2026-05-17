import { Link } from "react-router-dom";
import HeroAnalyticsStrip from "./HeroAnalyticsStrip";

function IconCtaArrow() {
  return (
    <svg
      className="home-hero__cta-arrow"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Copy, inline hero stats, and primary CTAs (hero background is CSS on the section).
 * @param {{ statsPayload: object | null }} p
 */
export default function HeroMainContent({ statsPayload }) {
  return (
    <div className="hero-main-content relative z-[1] mx-auto flex min-h-0 w-full max-w-[min(100%,48rem)] flex-col items-center justify-start">
      <div className="home-hero__copy flex min-w-0 w-full flex-col items-center gap-3 text-center">
        <img
          src="/hero/fullLogp.png"
          alt="أوردرز هاوس"
          width={760}
          height={220}
          decoding="async"
          className="home-hero__logo mb-4 h-32 w-auto max-w-[min(760px,98vw)] object-contain sm:h-36 md:h-44 lg:h-52 xl:h-56"
        />
        <h1 id="home-hero-heading" className="home-hero__ref-title home-hero-marketing__title-ipad">
          <span className="home-hero-marketing__title-sub block">منصة واحدة تجمعك بالخدمات والمستقلين المناسبين</span>
        </h1>

        <p className="home-hero__lead w-full min-w-0 max-w-[min(100%,48rem)]">
          ابدأ بطلبك بسهولة، قارن الخدمات المتاحة، وتابع كل خطوة من مكان واحد حتى تصل للنتيجة التي تحتاجها.
        </p>

        <div className="home-hero__inline-stats w-full min-w-0">
          <HeroAnalyticsStrip statsPayload={statsPayload} />
        </div>

        <div className="home-hero__cta home-hero-marketing__cta-row mt-4 flex w-full min-w-0 flex-wrap justify-center gap-2 sm:mt-5">
          <Link to="/register" className="home-hero__cta-primary home-hero-marketing__cta-primary">
            ابدأ طلبك الآن
          </Link>
          <Link to="/services" className="home-hero__cta-secondary">
            <span className="home-hero__cta-secondary-label">استكشف الخدمات</span>
            <IconCtaArrow />
          </Link>
        </div>
      </div>
    </div>
  );
}
