import PremiumPromoBanner from "./PremiumPromoBanner";
import { primaryHref } from "./adUtils";
import "./home-promo-banner-templates.css";
import "./home-promo-premium-banners.css";

/**
 * @param {object} p
 * @param {import("../../types/ad.js").Ad} p.ad
 * @param {() => void} [p.onTrackClick]
 * @param {(ad: import("../../types/ad.js").Ad, triggerEl: HTMLElement) => void} [p.onOpenDetails]
 * @param {"default"|"sticky"} [p.variant]
 * @param {boolean} [p.previewMode] — admin preview: no modal trigger
 */
export default function HomePromoOfferCard({ ad, onTrackClick, onOpenDetails, variant = "default", previewMode = false }) {
  const href = primaryHref(ad);

  const stopCardActivate = (e) => {
    e.stopPropagation();
  };

  const bannerInner = (
    <PremiumPromoBanner
      ad={ad}
      previewMode={previewMode}
      onTrackClick={onTrackClick}
      stopCardActivate={stopCardActivate}
    />
  );

  if (previewMode) {
    return <div className="home-promo-banner-frame home-promo-card--preview">{bannerInner}</div>;
  }

  const openFromShell = (triggerEl) => {
    onOpenDetails?.(ad, triggerEl);
  };

  const shellClass =
    variant === "sticky"
      ? "home-promo-banner-frame home-promo-card__shell home-promo-card__shell--sticky focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f3b65]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      : "home-promo-banner-frame home-promo-card__shell focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f3b65]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f7f8]";

  return (
    <div
      className={shellClass}
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-label={`عرض تفاصيل الإعلان: ${ad.title}`}
      data-home-promo-card-trigger
      onClick={(e) => openFromShell(/** @type {HTMLElement} */ (e.currentTarget))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openFromShell(/** @type {HTMLElement} */ (e.currentTarget));
        }
      }}
    >
      {bannerInner}
    </div>
  );
}
