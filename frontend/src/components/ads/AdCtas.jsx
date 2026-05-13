import { linkTargetRel } from "./adUtils";

/**
 * @param {object} props
 * @param {import("../../types/ad.js").Ad} props.ad
 * @param {boolean} props.inline
 * @param {() => void} [props.onNavigate]
 */
export default function AdCtas({ ad, inline = false, onNavigate }) {
  const wrapCls = inline ? "flex flex-wrap items-center gap-2 justify-center sm:justify-start" : "mt-4 grid gap-2";

  const btnBase =
    "inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-bold transition-transform duration-300 group-hover:translate-y-[-1px]";

  const primaryStyle = ad.buttonColor || ad.buttonTextColor
    ? {
        backgroundColor: ad.buttonColor || "#2f3b65",
        color: ad.buttonTextColor || "#ffffff",
      }
    : undefined;

  const secondaryCls = "border border-slate-200/90 bg-white/90 text-slate-800 hover:bg-white";

  return (
    <div className={wrapCls} dir="rtl">
      {ad.ctaText && ad.ctaUrl ? (
        <a
          href={ad.ctaUrl}
          {...linkTargetRel(ad, ad.ctaUrl)}
          className={`${btnBase} ${!primaryStyle ? "bg-[#2f3b65] text-white shadow-sm hover:shadow-md" : ""}`}
          style={primaryStyle}
          onClick={() => onNavigate?.()}
        >
          {ad.ctaText}
        </a>
      ) : null}
      {ad.secondaryCtaText && ad.secondaryCtaUrl ? (
        <a
          href={ad.secondaryCtaUrl}
          {...linkTargetRel(ad, ad.secondaryCtaUrl)}
          className={`${btnBase} ${secondaryCls}`}
          onClick={() => onNavigate?.()}
        >
          {ad.secondaryCtaText}
        </a>
      ) : null}
    </div>
  );
}
