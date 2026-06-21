import { Link } from "react-router-dom";
import HeroAnalyticsStrip from "./HeroAnalyticsStrip";
import { useTranslation } from "../../i18n/LanguageProvider";
import BrandLogo from "../brand/BrandLogo";function IconCtaArrow({ isRtl }) {
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
        d={isRtl ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"}
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
  const { t, isRtl } = useTranslation();

  return (
    <div className="hero-main-content relative z-[1] flex min-h-0 w-full flex-col items-center justify-start">
      <div className="home-hero__copy flex min-w-0 w-full flex-col items-center gap-3 text-center">
        <BrandLogo variant="hero" />        <h1 id="home-hero-heading" className="home-hero__ref-title home-hero-marketing__title-ipad w-full min-w-0">
          <span className="home-hero-marketing__title-sub block">{t("home.hero.title")}</span>
        </h1>

        <p className="home-hero__lead w-full min-w-0">
          {t("home.hero.lead")}
        </p>

        <div className="home-hero__start-cta">
          <Link to="/login" className="home-hero__cta-primary home-hero-marketing__cta-primary">
            {t("home.hero.startNow")}
          </Link>
        </div>

        <div className="home-hero__inline-stats w-full min-w-0">
          <HeroAnalyticsStrip statsPayload={statsPayload} />
        </div>

        <div className="home-hero__cta home-hero-marketing__cta-row flex w-full min-w-0 flex-wrap justify-center gap-2 sm:mt-5">
          <Link to="/register" className="home-hero__cta-primary home-hero-marketing__cta-primary">
            {t("home.hero.ctaPrimary")}
          </Link>
          <Link to="/services" className="home-hero__cta-secondary">
            <span className="home-hero__cta-secondary-label">{t("home.hero.ctaSecondary")}</span>
            <IconCtaArrow isRtl={isRtl} />
          </Link>
        </div>
      </div>
    </div>
  );
}
