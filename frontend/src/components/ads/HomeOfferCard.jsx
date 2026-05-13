import SafeAdImage from "./SafeAdImage";
import { linkTargetRel, primaryHref, truncateText } from "./adUtils";
import { resolveOfferSurface } from "./homeOffersTheme";
import "./home-featured-offers.css";

/**
 * @param {object} p
 * @param {import("../../types/ad.js").Ad} p.ad
 * @param {"featured"|"compact"} p.size
 * @param {() => void} [p.onTrackClick]
 */
export default function HomeOfferCard({ ad, size = "compact", onTrackClick }) {
  const surface = resolveOfferSurface(ad);
  const img = ad.images && ad.images[0];
  const href = primaryHref(ad);
  const isFeatured = size === "featured";
  const subtitle = ad.subtitle?.trim() || "";
  const description = ad.description?.trim() || "";
  const subMax = isFeatured ? 120 : 90;
  const descMax = isFeatured ? 220 : 140;

  const ctaAsLink = Boolean(href && ad.ctaText?.trim() && !ad.isClickableCard);
  const cta = href && ad.ctaText?.trim() && (
    ctaAsLink ? (
      <a
        href={href}
        {...linkTargetRel(ad, href)}
        className={`home-offer-card__cta ${isFeatured ? "home-offer-card__cta--lg" : ""}`}
        style={{ backgroundColor: surface.btnBg, color: surface.btnFg }}
        onClick={() => onTrackClick?.()}
      >
        {ad.ctaText.trim()}
      </a>
    ) : (
      <span
        className={`home-offer-card__cta home-offer-card__cta--static ${isFeatured ? "home-offer-card__cta--lg" : ""}`}
        style={{ backgroundColor: surface.btnBg, color: surface.btnFg }}
      >
        {ad.ctaText.trim()}
      </span>
    )
  );

  const textBlock = (
    <div className="home-offer-card__text min-w-0">
      {ad.badgeText?.trim() ? (
        <span
          className={`home-offer-card__badge ${isFeatured ? "home-offer-card__badge--lg" : ""}`}
          style={{ backgroundColor: surface.badgeBg, color: surface.badgeFg }}
        >
          {ad.badgeText.trim()}
        </span>
      ) : null}
      <h3 className={isFeatured ? "home-offer-card__title home-offer-card__title--featured" : "home-offer-card__title"} style={{ color: surface.titleColor }}>
        {truncateText(ad.title, isFeatured ? 120 : 90)}
      </h3>
      {subtitle ? (
        <p className="home-offer-card__subtitle" style={{ color: surface.textColor }}>
          {truncateText(subtitle, subMax)}
        </p>
      ) : null}
      {description ? (
        <p className="home-offer-card__desc" style={{ color: surface.textColor }}>
          {truncateText(description, descMax)}
        </p>
      ) : null}
      {cta ? <div className="home-offer-card__cta-wrap">{cta}</div> : null}
    </div>
  );

  const imgBlock = img ? (
    <div className={isFeatured ? "home-offer-card__media home-offer-card__media--featured" : "home-offer-card__media"}>
      <SafeAdImage
        src={img.url}
        alt={img.alt || ad.title}
        className="home-offer-card__media-inner"
        imgClassName={`home-offer-card__img ${img.objectFit === "contain" ? "object-contain" : "object-contain"}`}
      />
    </div>
  ) : null;

  const cardBody = (
    <article
      className={`home-offer-card ${isFeatured ? "home-offer-card--featured" : "home-offer-card--compact"}`}
      style={{
        backgroundImage: surface.gradientCss,
        borderColor: surface.cardBorder,
      }}
    >
      <div className={`home-offer-card__grid ${imgBlock ? "home-offer-card__grid--has-media" : ""}`}>
        {textBlock}
        {imgBlock}
      </div>
    </article>
  );

  if (ad.isClickableCard && href) {
    return (
      <a
        href={href}
        {...linkTargetRel(ad, href)}
        className="home-offer-card__link block rounded-[inherit] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f3b65]/35"
        onClick={() => onTrackClick?.()}
      >
        {cardBody}
      </a>
    );
  }

  return cardBody;
}
