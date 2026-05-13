import AdCtas from "./AdCtas";
import AdSponsoredLabel from "./AdSponsoredLabel";
import AdTextBlocks from "./AdTextBlocks";
import SafeAdImage from "./SafeAdImage";
import { linkTargetRel, primaryHref, truncateText } from "./adUtils";

/**
 * تقسيم أفقي: موضع الصورة لليسار أو لليمين على الشاشة (اتجاه LTR داخل الحاوية للتحكم البصري).
 * عمودي: أعلى / أسفل.
 *
 * @param {object} p
 * @param {import("../../types/ad.js").Ad} p.ad
 * @param {string} [p.className]
 * @param {() => void} [p.onTrackClick]
 * @param {boolean} [p.compact]
 */
export default function AdSplit({ ad, className = "", onTrackClick, compact }) {
  const img = ad.images?.[0];
  const href = primaryHref(ad);
  const pos = ad.imagePosition || "right";

  const stackVertical = pos === "top" || pos === "bottom";

  const imageEl = img ? (
    <div className={`relative overflow-hidden ${stackVertical ? "h-40 w-full sm:h-44" : "min-h-[160px] w-full sm:w-[44%]"}`}>
      <SafeAdImage
        src={img.url}
        alt={img.alt || ad.title}
        className="h-full w-full"
        imgClassName={`oh-ad-card__img h-full w-full ${img.objectFit === "contain" ? "object-contain" : "object-cover"}`}
      />
    </div>
  ) : null;

  const textEl = (
    <div className="flex flex-1 flex-col justify-center p-5 text-right" dir="rtl">
      <h3 className="text-lg font-extrabold" style={{ color: ad.titleColor || "#0f172a" }}>
        {truncateText(ad.title, compact ? 52 : 76)}
      </h3>
      {ad.subtitle ? <p className="mt-1 text-sm font-semibold opacity-90">{truncateText(ad.subtitle, 96)}</p> : null}
      {ad.description ? (
        <p className="mt-2 text-sm leading-relaxed opacity-85" style={{ color: ad.textColor }}>
          {truncateText(ad.description, compact ? 110 : 180)}
        </p>
      ) : null}
      <AdTextBlocks ad={ad} />
      {!(ad.isClickableCard && href) ? <AdCtas ad={ad} onNavigate={onTrackClick} /> : null}
      {ad.isClickableCard && href && ad.ctaText ? (
        <div className="mt-4 inline-flex rounded-2xl bg-[#2f3b65]/10 px-4 py-2 text-sm font-bold text-[#2f3b65]">{ad.ctaText}</div>
      ) : null}
    </div>
  );

  const rowContent = (() => {
    if (stackVertical) {
      if (pos === "top") {
        return (
          <>
            {imageEl}
            {textEl}
          </>
        );
      }
      return (
        <>
          {textEl}
          {imageEl}
        </>
      );
    }
    // physical: left = image first in LTR row; right = image second
    if (pos === "left") {
      return (
        <>
          {imageEl}
          {textEl}
        </>
      );
    }
    return (
      <>
        {textEl}
        {imageEl}
      </>
    );
  })();

  const inner = (
    <article
      className={`oh-ad-card group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl ${className}`.trim()}
      style={{
        backgroundColor: ad.backgroundColor || undefined,
        borderColor: ad.borderColor || undefined,
      }}
    >
      <div className="absolute start-3 top-3 z-10">
        <AdSponsoredLabel className="rounded-full bg-white/95 px-2.5 py-1 shadow-sm ring-1 ring-slate-200/80" />
      </div>
      {ad.badgeText ? (
        <span
          className="absolute end-3 top-3 z-10 rounded-full px-3 py-1 text-xs font-bold shadow-sm"
          style={{ backgroundColor: ad.badgeColor || "rgba(47,59,101,0.1)", color: "#1e293b" }}
        >
          {ad.badgeText}
        </span>
      ) : null}
      <div
        dir={stackVertical ? "rtl" : "ltr"}
        className={stackVertical ? "flex flex-col" : "flex flex-col sm:flex-row sm:items-stretch"}
      >
        {rowContent}
      </div>
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
