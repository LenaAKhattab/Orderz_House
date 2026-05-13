import AdCtas from "./AdCtas";
import AdSponsoredLabel from "./AdSponsoredLabel";
import AdTextBlocks from "./AdTextBlocks";
import { linkTargetRel, primaryHref, truncateText } from "./adUtils";

/**
 * @param {object} p
 * @param {import("../../types/ad.js").Ad} p.ad
 * @param {string} [p.className]
 * @param {() => void} [p.onTrackClick]
 * @param {boolean} [p.compact]
 */
export default function AdTextOnly({ ad, className = "", onTrackClick, compact }) {
  const href = primaryHref(ad);

  const inner = (
    <article
      className={`relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 text-right shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl ${className}`.trim()}
      style={{
        backgroundColor: ad.backgroundColor || "#ffffff",
        borderColor: ad.borderColor || undefined,
        backgroundImage:
          ad.gradientFrom && ad.gradientTo
            ? `linear-gradient(145deg, ${ad.gradientFrom}, ${ad.gradientTo})`
            : undefined,
        color: ad.textColor || undefined,
        textAlign: ad.textAlign || "right",
      }}
    >
      <div className="absolute start-3 top-3">
        <AdSponsoredLabel className="rounded-full bg-white/90 px-2.5 py-1 shadow-sm ring-1 ring-slate-200/80" />
      </div>
      {ad.badgeText ? (
        <span
          className="absolute end-3 top-3 rounded-full px-3 py-1 text-xs font-bold shadow-sm"
          style={{ backgroundColor: ad.badgeColor || "rgba(47,59,101,0.12)", color: "#1e293b" }}
        >
          {ad.badgeText}
        </span>
      ) : null}
      <h3 className="mt-6 text-lg font-extrabold" style={{ color: ad.titleColor || ad.textColor || "#0f172a" }}>
        {truncateText(ad.title, compact ? 56 : 80)}
      </h3>
      {ad.subtitle ? <p className="mt-1 text-sm font-semibold opacity-90">{truncateText(ad.subtitle, 100)}</p> : null}
      {ad.description ? (
        <p className="mt-2 text-sm leading-relaxed opacity-88">{truncateText(ad.description, compact ? 120 : 220)}</p>
      ) : null}
      <AdTextBlocks ad={ad} />
      {!(ad.isClickableCard && href) ? <AdCtas ad={ad} onNavigate={onTrackClick} /> : null}
      {ad.isClickableCard && href && ad.ctaText ? (
        <div className="mt-4 inline-flex rounded-2xl bg-[#2f3b65] px-4 py-2 text-sm font-bold text-white">{ad.ctaText}</div>
      ) : null}
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
        {inner}
      </a>
    );
  }

  return inner;
}
