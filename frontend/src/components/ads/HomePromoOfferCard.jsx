import SafeAdImage from "./SafeAdImage";
import { linkTargetRel, primaryHref, truncateText } from "./adUtils";
import { resolveOfferSurface } from "./homeOffersTheme";

/**
 * Homepage horizontal band — premium white card (RTL). Card opens detail modal on activate.
 * @param {{ ad: import("../../types/ad.js").Ad; onTrackClick?: () => void; onOpenDetails?: (ad: import("../../types/ad.js").Ad, triggerEl: HTMLElement) => void; variant?: "default" | "sticky" }} p
 */
export default function HomePromoOfferCard({ ad, onTrackClick, onOpenDetails, variant = "default" }) {
  const surface = resolveOfferSurface(ad);
  const img = ad.images && ad.images[0];
  const href = primaryHref(ad);
  const subtitle = ad.subtitle?.trim() || "";
  const description = ad.description?.trim() || "";

  const openFromShell = (triggerEl) => {
    onOpenDetails?.(ad, triggerEl);
  };

  const stopCardActivate = (e) => {
    e.stopPropagation();
  };

  const cta =
    href &&
    ad.ctaText?.trim() &&
    (!ad.isClickableCard ? (
      <a
        href={href}
        {...linkTargetRel(ad, href)}
        className="home-promo-card__btn"
        style={{ borderColor: surface.btnBg, color: surface.btnBg }}
        onClick={(e) => {
          stopCardActivate(e);
          onTrackClick?.();
        }}
        onMouseDown={stopCardActivate}
      >
        {ad.ctaText.trim()}
      </a>
    ) : (
      <span className="home-promo-card__btn home-promo-card__btn--static" style={{ borderColor: surface.btnBg, color: surface.btnBg }}>
        {ad.ctaText.trim()}
      </span>
    ));

  const body = (
    <>
      <div className="home-promo-card__body min-w-0">
        {ad.badgeText?.trim() ? (
          <span className="home-promo-card__badge" style={{ backgroundColor: surface.badgeBg, color: surface.badgeFg }}>
            {ad.badgeText.trim()}
          </span>
        ) : null}
        <h3 className="home-promo-card__title" style={{ color: surface.titleColor }}>
          {truncateText(ad.title, 100)}
        </h3>
        {subtitle ? (
          <p className="home-promo-card__subtitle" style={{ color: surface.btnBg }}>
            {truncateText(subtitle, 100)}
          </p>
        ) : null}
        {description ? (
          <p className="home-promo-card__desc" style={{ color: surface.textColor }}>
            {truncateText(description, 400)}
          </p>
        ) : null}
        {cta ? <div className="home-promo-card__cta-row">{cta}</div> : null}
      </div>
      {img ? (
        <div className="home-promo-card__media">
          <SafeAdImage
            src={img.url}
            alt={img.alt || ad.title}
            className="home-promo-card__media-inner"
            imgClassName="home-promo-card__img object-contain"
          />
        </div>
      ) : null}
    </>
  );

  const card = (
    <article
      className={`home-promo-card${img ? " home-promo-card--has-image" : ""}`}
      dir="rtl"
      style={{ borderColor: "rgba(226, 232, 240, 0.95)" }}
    >
      {body}
    </article>
  );

  const shellClass =
    variant === "sticky"
      ? "home-promo-card__shell home-promo-card__shell--sticky min-w-0 rounded-[clamp(0.75rem,1.5vw,0.95rem)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f3b65]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      : "home-promo-card__shell min-w-0 rounded-[clamp(0.85rem,2vw,1.1rem)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f3b65]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f7f8]";

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
      {card}
    </div>
  );
}
