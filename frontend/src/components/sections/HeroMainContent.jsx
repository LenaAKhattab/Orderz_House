import { Link } from "react-router-dom";
import HeroAnalyticsStrip from "./HeroAnalyticsStrip";
import HeroDeviceVisual from "./HeroDeviceVisual";

function IconChevronLeft() {
  return (
    <svg className="home-hero__cta-chevron size-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Copy, illustration, inline hero stats, then primary CTAs.
 * @param {{ statsPayload: object | null }} p
 */
export default function HeroMainContent({ statsPayload }) {
  return (
    <div className="hero-main-content min-w-0 w-full">
      <div className="grid min-w-0 grid-cols-1 content-start items-start gap-6 sm:gap-8 lg:grid-cols-12 lg:items-center lg:gap-x-10 lg:gap-y-6 xl:gap-x-14">
        <div className="home-hero__copy flex min-w-0 flex-col items-center gap-3 text-center lg:col-span-5 lg:items-start lg:text-start">
          <h1 id="home-hero-heading" className="home-hero__ref-title home-hero-marketing__title-ipad">
            <span className="block">طلبات، خدمات، ومستقلون</span>
            <span className="home-hero-marketing__title-sub">في مسار واحد يشبه تجربتك داخل المنصة</span>
          </h1>

          <p className="home-hero__lead w-full min-w-0 max-w-[min(100%,48rem)]">
            جرّب معاينة تفاعلية للوحة، الخدمات، سوق الطلبات، والدخول — ثم انطلق بإنشاء طلبك أو استكشاف الخدمات.
          </p>

          <div className="home-hero__inline-stats w-full min-w-0">
            <HeroAnalyticsStrip statsPayload={statsPayload} />
          </div>

          <div className="home-hero__cta home-hero-marketing__cta-row mt-4 flex w-full min-w-0 flex-wrap justify-center gap-2 sm:mt-5 lg:justify-start">
            <Link to="/register" className="btn btn-primary home-hero__cta-primary home-hero-marketing__cta-primary">
              ابدأ طلبك الآن
              <IconChevronLeft />
            </Link>
            <Link to="/services" className="btn btn-secondary home-hero__cta-secondary">
              <span>استكشف الخدمات</span>
              <IconChevronLeft />
            </Link>
          </div>
        </div>

        <div className="hero-main-content__visual flex min-h-0 min-w-0 w-full max-w-full justify-center self-center overflow-x-clip lg:col-span-7 lg:justify-end">
          <HeroDeviceVisual />
        </div>
      </div>
    </div>
  );
}
