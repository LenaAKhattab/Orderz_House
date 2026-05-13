import AdSponsoredLabel from "./AdSponsoredLabel";
import SafeAdImage from "./SafeAdImage";
import { linkTargetRel, primaryHref, truncateText } from "./adUtils";

/**
 * @param {object} p
 * @param {import("../../types/ad.js").Ad} p.ad
 * @param {string} [p.className]
 * @param {() => void} [p.onTrackClick]
 */
export default function AdMinimalBanner({ ad, className = "", onTrackClick }) {
  const img = ad.images?.[0];
  const href = primaryHref(ad);

  const inner = (
    <article
      className={`relative flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm transition-all duration-300 hover:shadow-md ${className}`.trim()}
      style={{
        backgroundColor: ad.backgroundColor || "#ffffff",
        borderColor: ad.borderColor || undefined,
      }}
      dir="rtl"
    >
      <div className="absolute start-2 top-2">
        <AdSponsoredLabel className="rounded bg-white/95 px-1.5 py-0.5 text-[0.58rem] shadow-sm" />
      </div>
      {img ? (
        <div className="relative ms-1 mt-5 h-12 w-12 shrink-0 overflow-hidden rounded-xl">
          <SafeAdImage
            src={img.url}
            alt={img.alt || ad.title}
            className="h-full w-full"
            imgClassName="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="ms-1 mt-5 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#2f3b65]/10 text-lg font-black text-[#2f3b65]">
          ◆
        </div>
      )}
      <div className="min-w-0 flex-1 pt-3 text-right">
        <p className="truncate text-sm font-extrabold" style={{ color: ad.titleColor || "#0f172a" }}>
          {truncateText(ad.title, 64)}
        </p>
        {ad.description ? (
          <p className="truncate text-xs opacity-75" style={{ color: ad.textColor }}>
            {truncateText(ad.description, 72)}
          </p>
        ) : null}
      </div>
      {ad.ctaText && href && !(ad.isClickableCard && href) ? (
        <a
          href={href}
          {...linkTargetRel(ad, href)}
          className="shrink-0 rounded-xl bg-[#2f3b65] px-3 py-2 text-xs font-bold text-white shadow-sm"
          onClick={() => onTrackClick?.()}
        >
          {ad.ctaText}
        </a>
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
