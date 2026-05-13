import AdCtas from "./AdCtas";
import AdSponsoredLabel from "./AdSponsoredLabel";
import AdTextBlocks from "./AdTextBlocks";
import SafeAdImage from "./SafeAdImage";
import { linkTargetRel, primaryHref, truncateText } from "./adUtils";
import "./ads.css";

/**
 * @param {object} p
 * @param {import("../../types/ad.js").Ad} p.ad
 * @param {string} [p.className]
 * @param {() => void} [p.onTrackClick]
 * @param {boolean} [p.compact]
 */
export default function AdImageTop({ ad, className = "", onTrackClick, compact }) {
  const img = ad.images && ad.images[0];
  const href = primaryHref(ad);
  const body = (
    <div
      className="flex flex-col p-5 text-right"
      style={{ color: ad.textColor || undefined, textAlign: ad.textAlign || "right" }}
    >
      <h3
        className="text-lg font-extrabold leading-snug"
        style={{ color: ad.titleColor || ad.textColor || undefined }}
      >
        {truncateText(ad.title, compact ? 56 : 80)}
      </h3>
      {ad.subtitle ? (
        <p className="mt-1 text-sm font-semibold opacity-90">{truncateText(ad.subtitle, 100)}</p>
      ) : null}
      {ad.description ? (
        <p className="mt-2 text-sm leading-relaxed opacity-85">{truncateText(ad.description, compact ? 120 : 200)}</p>
      ) : null}
      <AdTextBlocks ad={ad} />
      {!(ad.isClickableCard && primaryHref(ad)) ? <AdCtas ad={ad} onNavigate={onTrackClick} /> : null}
      {ad.isClickableCard && primaryHref(ad) && ad.ctaText ? (
        <div className="mt-4 inline-flex rounded-2xl bg-[#2f3b65]/10 px-4 py-2 text-sm font-bold text-[#2f3b65]">
          {ad.ctaText}
        </div>
      ) : null}
    </div>
  );

  const cardInner = (
    <article
      className={`oh-ad-card group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl ${className}`.trim()}
      style={{
        backgroundColor: ad.backgroundColor || undefined,
        borderColor: ad.borderColor || undefined,
        backgroundImage:
          ad.gradientFrom && ad.gradientTo
            ? `linear-gradient(135deg, ${ad.gradientFrom}, ${ad.gradientTo})`
            : undefined,
      }}
    >
      <div className="absolute start-3 top-3 z-20">
        <AdSponsoredLabel className="rounded-full bg-white/90 px-2.5 py-1 shadow-sm ring-1 ring-slate-200/80" />
      </div>
      {ad.badgeText ? (
        <span
          className="absolute end-3 top-3 z-20 rounded-full px-3 py-1 text-xs font-bold shadow-sm"
          style={{ backgroundColor: ad.badgeColor || "rgba(47,59,101,0.1)", color: "#1e293b" }}
        >
          {ad.badgeText}
        </span>
      ) : null}
      {img ? (
        <div className="relative h-40 w-full overflow-hidden sm:h-44">
          <SafeAdImage
            src={img.url}
            alt={img.alt || ad.title}
            className="h-full w-full"
            imgClassName={`oh-ad-card__img h-full w-full ${img.objectFit === "contain" ? "object-contain" : "object-cover"}`}
          />
        </div>
      ) : null}
      {body}
    </article>
  );

  if (ad.isClickableCard && href) {
    return (
      <a
        href={href}
        {...linkTargetRel(ad, href)}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f3b65]/40"
        onClick={() => onTrackClick?.()}
      >
        {cardInner}
      </a>
    );
  }

  return cardInner;
}
