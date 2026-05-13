import { useEffect, useMemo, useState } from "react";
import AdCtas from "./AdCtas";
import AdSponsoredLabel from "./AdSponsoredLabel";
import AdTextBlocks from "./AdTextBlocks";
import SafeAdImage from "./SafeAdImage";
import { linkTargetRel, primaryHref, truncateText } from "./adUtils";

/**
 * @param {object} p
 * @param {import("../../types/ad.js").Ad} p.ad
 * @param {string} [p.className]
 * @param {() => void} [p.onTrackClick]
 * @param {boolean} [p.compact]
 */
export default function AdCarousel({ ad, className = "", onTrackClick, compact }) {
  const slides = useMemo(() => (Array.isArray(ad.images) ? ad.images.filter(Boolean) : []), [ad.images]);
  const [idx, setIdx] = useState(0);
  const href = primaryHref(ad);

  useEffect(() => {
    if (slides.length <= 1) return undefined;
    const t = window.setInterval(() => {
      setIdx((i) => (i + 1) % slides.length);
    }, 5200);
    return () => window.clearInterval(t);
  }, [slides.length]);

  const slide = slides[idx] || slides[0];

  const inner = (
    <article
      className={`oh-ad-card group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl ${className}`.trim()}
      style={{ borderColor: ad.borderColor || undefined }}
    >
      <div className="absolute start-3 top-3 z-20">
        <AdSponsoredLabel className="rounded-full bg-white/95 px-2.5 py-1 shadow-sm ring-1 ring-slate-200/80" />
      </div>
      {ad.badgeText ? (
        <span
          className="absolute end-3 top-3 z-20 rounded-full px-3 py-1 text-xs font-bold shadow-sm"
          style={{ backgroundColor: ad.badgeColor || "rgba(47,59,101,0.1)", color: "#1e293b" }}
        >
          {ad.badgeText}
        </span>
      ) : null}
      <div className="relative h-44 w-full overflow-hidden">
        {slide ? (
          <SafeAdImage
            src={slide.url}
            alt={slide.alt || ad.title}
            className="h-full w-full"
            imgClassName={`oh-ad-card__img h-full w-full ${slide.objectFit === "contain" ? "object-contain" : "object-cover"}`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">بدون صور</div>
        )}
        {slides.length > 1 ? (
          <>
            <button
              type="button"
              className="absolute start-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-lg shadow-md ring-1 ring-slate-200/80 transition hover:bg-white"
              aria-label="السابق"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIdx((i) => (i - 1 + slides.length) % slides.length);
              }}
            >
              ‹
            </button>
            <button
              type="button"
              className="absolute end-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-lg shadow-md ring-1 ring-slate-200/80 transition hover:bg-white"
              aria-label="التالي"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIdx((i) => (i + 1) % slides.length);
              }}
            >
              ›
            </button>
          </>
        ) : null}
      </div>
      <div className="p-5 text-right" dir="rtl">
        <h3 className="text-lg font-extrabold" style={{ color: ad.titleColor || "#0f172a" }}>
          {truncateText(ad.title, compact ? 52 : 76)}
        </h3>
        {ad.description ? (
          <p className="mt-2 text-sm opacity-85">{truncateText(ad.description, compact ? 110 : 180)}</p>
        ) : null}
        <AdTextBlocks ad={ad} />
        {!(ad.isClickableCard && href) ? <AdCtas ad={ad} onNavigate={onTrackClick} /> : null}
        {ad.isClickableCard && href && ad.ctaText ? (
          <div className="mt-4 inline-flex rounded-2xl bg-[#2f3b65]/10 px-4 py-2 text-sm font-bold text-[#2f3b65]">{ad.ctaText}</div>
        ) : null}
        {slides.length > 1 ? (
          <div className="mt-4 flex justify-center gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.id || i}
                type="button"
                className={`h-2 rounded-full transition-all ${i === idx ? "w-6 bg-[#2f3b65]" : "w-2 bg-slate-300"}`}
                aria-label={`شريحة ${i + 1}`}
                aria-current={i === idx}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIdx(i);
                }}
              />
            ))}
          </div>
        ) : null}
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
