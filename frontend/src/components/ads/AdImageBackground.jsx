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
export default function AdImageBackground({ ad, className = "", onTrackClick, compact }) {
  const img = ad.images?.find((x) => x.position === "background") || ad.images?.[0];
  const href = primaryHref(ad);

  const overlay = (
    <div
      className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/35 to-slate-950/15"
      aria-hidden="true"
    />
  );

  const body = (
    <div className="relative z-10 flex min-h-[220px] flex-col justify-end p-5 text-right text-white sm:min-h-[260px]" dir="rtl">
      <h3 className="text-xl font-extrabold leading-snug drop-shadow-sm">{truncateText(ad.title, compact ? 48 : 72)}</h3>
      {ad.subtitle ? <p className="mt-1 text-sm font-semibold opacity-95">{truncateText(ad.subtitle, 90)}</p> : null}
      {ad.description ? (
        <p className="mt-2 text-sm leading-relaxed opacity-95">{truncateText(ad.description, compact ? 100 : 160)}</p>
      ) : null}
      <AdTextBlocks ad={{ ...ad, textColor: ad.textColor || "#f8fafc" }} />
      {!(ad.isClickableCard && href) ? (
        <AdCtas
          ad={{
            ...ad,
            buttonColor: ad.buttonColor || "#ffffff",
            buttonTextColor: ad.buttonTextColor || "#1e293b",
          }}
          onNavigate={onTrackClick}
        />
      ) : null}
      {ad.isClickableCard && href && ad.ctaText ? (
        <div className="mt-4 inline-flex rounded-2xl bg-white/95 px-4 py-2 text-sm font-bold text-slate-900 shadow-sm">
          {ad.ctaText}
        </div>
      ) : null}
    </div>
  );

  const cardInner = (
    <article
      className={`oh-ad-card group relative overflow-hidden rounded-3xl border border-slate-200/80 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl ${className}`.trim()}
      style={{ borderColor: ad.borderColor || undefined }}
    >
      <div className="absolute start-3 top-3 z-20">
        <AdSponsoredLabel className="rounded-full bg-black/35 px-2.5 py-1 text-[0.62rem] text-white backdrop-blur-sm" />
      </div>
      {ad.badgeText ? (
        <span
          className="absolute end-3 top-3 z-20 rounded-full px-3 py-1 text-xs font-bold shadow-sm ring-1 ring-white/30"
          style={{ backgroundColor: ad.badgeColor || "rgba(255,255,255,0.2)", color: "#fff" }}
        >
          {ad.badgeText}
        </span>
      ) : null}
      <div className="relative min-h-[220px] w-full sm:min-h-[260px]">
        {img ? (
          <SafeAdImage
            src={img.url}
            alt={img.alt || ad.title}
            className="absolute inset-0 h-full w-full"
            imgClassName={`oh-ad-card__img absolute inset-0 h-full w-full ${img.objectFit === "contain" ? "object-contain" : "object-cover"}`}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950" />
        )}
        {overlay}
        {body}
      </div>
    </article>
  );

  if (ad.isClickableCard && href) {
    return (
      <a
        href={href}
        {...linkTargetRel(ad, href)}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        onClick={() => onTrackClick?.()}
      >
        {cardInner}
      </a>
    );
  }

  return cardInner;
}
