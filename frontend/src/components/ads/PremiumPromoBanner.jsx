import SafeAdImage from "./SafeAdImage";
import { linkTargetRel, primaryHref, truncateText } from "./adUtils";
import { getBannerMetaFromTexts, parseSalePercent, resolveBannerTemplateId } from "./bannerAdMeta";
import { getAdVisualAsset, resolveAdAssetBannerUrl } from "./adVisualAssets";
import { getTemplateConfig, resolveImagePresentation } from "./bannerDesignSystem";
import { resolvePremiumBannerSurface } from "./homeOffersTheme";
import "./home-promo-premium-banners.css";
import "./home-promo-banner-structures.css";
import "./home-promo-banner-premium-composition.css";

function ClockIcon() {
  return (
    <svg className="ppm__badge-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg className="ppm__cta-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M6 6V5a4 4 0 118 0v1M4 6h12l-1 11H5L4 6z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Corner-wrap preset (e.g. red ribbon on card edge).
 * @param {{ assetKey?: string | null }} p
 */
function CornerPresetAsset({ assetKey }) {
  const asset = getAdVisualAsset(assetKey);
  if (!asset || asset.presentation !== "corner") return null;

  const corner = asset.corner || "top-end";
  const url = resolveAdAssetBannerUrl(assetKey);
  if (!url) return null;

  const cornerClass = corner.replace(/_/g, "-");

  return (
    <div className={`ppm__corner-ribbon-layer ppm__corner-ribbon-layer--${cornerClass}`} dir="ltr" aria-hidden>
      <SafeAdImage src={url} alt="" imgClassName="ppm__corner-ribbon-img" />
    </div>
  );
}

/**
 * @param {object} p
 * @param {import("../../types/ad.js").Ad} p.ad
 * @param {boolean} [p.previewMode]
 * @param {() => void} [p.onTrackClick]
 * @param {(e: import("react").MouseEvent) => void} [p.stopCardActivate]
 */
export default function PremiumPromoBanner({ ad, previewMode = false, onTrackClick, stopCardActivate }) {
  const tpl = resolveBannerTemplateId(ad);
  const cfg = getTemplateConfig(tpl);
  const structure = cfg.structure;
  const surface = resolvePremiumBannerSurface(ad);
  const meta = getBannerMetaFromTexts(ad.texts);
  const imgs = resolveImagePresentation(ad, meta);
  const presetAssetKey = meta.selectedAssetKey != null ? String(meta.selectedAssetKey).trim() : "";
  const presetAsset = getAdVisualAsset(presetAssetKey);
  const isScreenBlendPreset = Boolean(presetAsset?.blendScreen);
  const isCornerRibbon =
    (imgs.mode === "preset" || imgs.mode === "preset_custom_bg") &&
    presetAsset?.presentation === "corner";
  const href = primaryHref(ad);

  const companyName = meta.companyName != null ? String(meta.companyName).trim() : "";
  const logoUrl = meta.logoUrl != null ? String(meta.logoUrl).trim() : "";
  const discountText = meta.discountText != null ? String(meta.discountText).trim() : "";
  const subtitle = ad.subtitle?.trim() || "";
  const description = ad.description?.trim() || "";
  const saleN = parseSalePercent(meta.salePercent);
  const showTopBadge = meta.showTopBadge !== false && Boolean(ad.badgeText?.trim());
  const showDiscountBadge = meta.showDiscountBadge !== false && (saleN != null || discountText);

  const hasBg = Boolean(imgs.showBackground && imgs.backgroundUrl);
  const bgStyle = {
    borderColor: surface.cardBorder,
    backgroundImage: hasBg ? undefined : surface.gradientCss,
    ...(hasBg ? { "--ppm-bg-url": `url("${imgs.backgroundUrl}")` } : {}),
    "--ppm-blob": `${surface.accentColor || "#6366f1"}22`,
    "--ppm-ribbon": `${surface.accentColor || "#ef4444"}38`,
  };

  const ctaLabel = ad.ctaText?.trim() || "";
  const ctaOutline = structure === "minimal_clean";
  const ctaShape =
    structure === "product_focus"
      ? " ppm__cta--pill"
      : structure === "business_partner"
        ? " ppm__cta--corporate"
        : structure === "ribbon_strip"
          ? " ppm__cta--compact"
          : "";
  const cta =
    ctaLabel &&
    (href || previewMode) &&
    (!ad.isClickableCard ? (
      previewMode ? (
        <span
          className={`ppm__cta${ctaOutline ? " ppm__cta--outline" : ""}${ctaShape}`}
          style={{ backgroundColor: ctaOutline ? undefined : surface.btnBg, color: ctaOutline ? surface.btnBg : surface.btnFg }}
        >
          {!ctaOutline ? <BagIcon /> : null}
          {ctaLabel}
        </span>
      ) : (
        <a
          href={href}
          {...linkTargetRel(ad, href)}
          className={`ppm__cta${ctaOutline ? " ppm__cta--outline" : ""}${ctaShape}`}
          style={{ backgroundColor: ctaOutline ? undefined : surface.btnBg, color: ctaOutline ? surface.btnBg : surface.btnFg }}
          onClick={(e) => {
            stopCardActivate?.(e);
            onTrackClick?.();
          }}
          onMouseDown={stopCardActivate}
        >
          {!ctaOutline ? <BagIcon /> : null}
          {ctaLabel}
        </a>
      )
    ) : (
      <span className="ppm__cta ppm__cta--static" style={{ borderColor: surface.btnBg, color: surface.btnBg }}>
        {ctaLabel}
      </span>
    ));

  const discountLine =
    saleN != null ? (
      <p className="ppm__discount-line" style={{ color: surface.discountLineColor || surface.accentCyan || surface.btnBg }}>
        خصم يصل إلى {saleN}%
      </p>
    ) : discountText ? (
      <p className="ppm__discount-line" style={{ color: surface.discountLineColor || surface.accentCyan || surface.btnBg }}>
        {truncateText(discountText, 80)}
      </p>
    ) : null;

  const saleCircle =
    showDiscountBadge && saleN != null ? (
      <span
        className="ppm__sale-sticker ppm__discount--on-visual"
        style={{ backgroundColor: surface.saleStickerBg || "#fdba74", color: surface.saleStickerFg || "#431407" }}
      >
        <span className="ppm__sale-sticker-pct">{saleN}%</span>
        <span className="ppm__sale-sticker-off">OFF</span>
      </span>
    ) : showDiscountBadge && discountText ? (
      <span
        className="ppm__sale-sticker ppm__sale-sticker--text ppm__discount--on-visual"
        style={{ backgroundColor: surface.saleStickerBg || "#fdba74", color: surface.saleStickerFg || "#431407" }}
      >
        {truncateText(discountText, 24)}
      </span>
    ) : null;

  const saleEdge =
    showDiscountBadge && saleN != null ? (
      <span
        className="ppm__discount--edge"
        style={{ backgroundColor: surface.saleStickerBg || "#ef4444", color: surface.saleStickerFg || "#fff" }}
      >
        {saleN}% خصم
      </span>
    ) : showDiscountBadge && discountText ? (
      <span className="ppm__discount--edge" style={{ backgroundColor: surface.saleStickerBg, color: surface.saleStickerFg }}>
        {truncateText(discountText, 18)}
      </span>
    ) : null;

  const saleLabel =
    showDiscountBadge && (saleN != null || discountText) ? (
      <span
        className="ppm__discount--label"
        style={{ backgroundColor: surface.saleStickerBg || "#f1f5f9", color: surface.saleStickerFg || "#334155" }}
      >
        {saleN != null ? `خصم ${saleN}%` : truncateText(discountText, 28)}
      </span>
    ) : null;

  const salePill =
    showDiscountBadge && saleN != null ? (
      <span className="ppm__discount--pill" style={{ backgroundColor: surface.saleStickerBg, color: surface.saleStickerFg }}>
        -{saleN}%
      </span>
    ) : null;

  const saleCenter =
    showDiscountBadge && saleN != null ? (
      <span
        className="ppm__discount--center ppm__sale-sticker ppm__sale-sticker--text"
        style={{ backgroundColor: surface.saleStickerBg, color: surface.saleStickerFg }}
      >
        {saleN}% OFF
      </span>
    ) : null;

  const topBadge = showTopBadge ? (
    <span
      className="ppm__top-badge"
      style={{ backgroundColor: surface.topBadgeBg || surface.badgeBg, color: surface.topBadgeFg || surface.badgeFg }}
    >
      <ClockIcon />
      {truncateText(ad.badgeText.trim(), 32)}
    </span>
  ) : null;

  const cornerRibbonEl = isCornerRibbon ? <CornerPresetAsset assetKey={presetAssetKey} /> : null;

  const visualCol = isCornerRibbon ? null : (
    <div
      className={`ppm__visual-col${structure === "business_partner" ? " ppm__visual-col--framed" : ""}${structure === "luxury_center" ? " ppm__visual-col--luxury" : ""}`}
      aria-hidden={imgs.mode === "none" && !imgs.foreground}
    >
      <div className="ppm__visual">
        <div className="ppm__visual-glow" style={{ background: `radial-gradient(circle, ${surface.accentColor || "#a78bfa"}33 0%, transparent 70%)` }} />
        {imgs.showForeground && imgs.foreground ? (
          <div
            className={`ppm__visual-media ppm__visual-media--${imgs.imageFit || "contain"}${
              isScreenBlendPreset ? " ppm__visual-media--screen-blend" : ""
            }`}
          >
            <SafeAdImage
              src={imgs.foreground.url}
              alt={imgs.foreground.alt || ad.title}
              className="block h-full w-full"
              imgClassName="ppm__visual-img"
            />
          </div>
        ) : structure !== "minimal_clean" && structure !== "ribbon_strip" ? (
          <div className="ppm__visual-placeholder">
            <span className="ppm__visual-shape ppm__visual-shape--box" />
            <span className="ppm__visual-shape ppm__visual-shape--bag" />
            <span className="ppm__visual-shape ppm__visual-shape--tag">%</span>
          </div>
        ) : null}
        {(structure === "classic_split" || structure === "product_focus") && saleCircle}
      </div>
    </div>
  );

  const copyCore = (
    <>
      {companyName ? (
        <p className="ppm__company" style={{ color: surface.companyNameColor || surface.textColor }}>
          {logoUrl ? <img src={logoUrl} alt="" className="ppm__company-logo" /> : <span className="ppm__company-dot" aria-hidden />}
          {truncateText(companyName, 80)}
        </p>
      ) : null}
      <h3 className="ppm__title" style={{ color: surface.titleColor }}>
        {truncateText(ad.title, 110)}
      </h3>
      {subtitle && structure !== "business_partner" ? (
        <p className="ppm__tagline">
          <span className="ppm__tagline-line" style={{ backgroundColor: surface.accentColor || "#a78bfa" }} aria-hidden />
          <span className="ppm__tagline-text" style={{ color: surface.subtitleColor || surface.accentColor || "#8b7cf7" }}>
            {truncateText(subtitle, 100)}
          </span>
          <span className="ppm__tagline-line" style={{ backgroundColor: surface.accentColor || "#a78bfa" }} aria-hidden />
        </p>
      ) : null}
      {subtitle && structure === "business_partner" ? (
        <p className="ppm__biz-sub" style={{ color: surface.subtitleColor || surface.textColor }}>
          {truncateText(subtitle, 90)}
        </p>
      ) : null}
      {description && structure !== "ribbon_strip" ? (
        <p className="ppm__desc" style={{ color: surface.descriptionColor || surface.textColor }}>
          {truncateText(description, 200)}
        </p>
      ) : null}
      {structure !== "ribbon_strip" && structure !== "minimal_clean" && structure !== "business_partner" ? discountLine : null}
      {structure === "business_partner" ? saleLabel : null}
    </>
  );

  const structureKebab = structure.replace(/_/g, "-");
  const shellClass = `ppm ppm--${structure} ad-banner--${structureKebab}${hasBg ? " ppm--has-bg" : ""}${isCornerRibbon ? " ad-banner--corner-ribbon ppm--corner-ribbon" : ""}${previewMode ? " ppm--preview" : ""}`;
  const decorClass =
    structure === "minimal_clean"
      ? "ppm__decor ppm__decor--minimal"
      : structure === "luxury_center"
        ? "ppm__decor ppm__decor--luxury"
        : structure === "classic_split"
          ? "ppm__decor ppm__decor--split"
          : "ppm__decor";

  if (structure === "ribbon_strip") {
    return (
      <article className={shellClass} dir="rtl" style={bgStyle}>
        {cornerRibbonEl}
        <div className="ppm__ribbon" aria-hidden />
        <div className={decorClass} style={{ opacity: surface.decorOpacity ?? 0.35 }} aria-hidden />
        <div className="ppm__shell">
          <div className="ppm__badge-slot ppm__badge-slot--inline">{topBadge}</div>
          {imgs.showForeground || imgs.mode === "preset" ? visualCol : null}
          <div className="ppm__copy">
            {subtitle ? <p className="ppm__strip-sub" style={{ color: surface.textColor }}>{truncateText(subtitle, 60)}</p> : null}
            <h3 className="ppm__title" style={{ color: surface.titleColor }}>
              {truncateText(ad.title, 70)}
            </h3>
          </div>
          {cta ? <div className="ppm__cta-row">{cta}</div> : null}
          {saleEdge}
        </div>
      </article>
    );
  }

  if (structure === "luxury_center") {
    return (
      <article className={shellClass} dir="rtl" style={bgStyle}>
        {cornerRibbonEl}
        <div className={decorClass} style={{ opacity: surface.decorOpacity ?? 0.4 }} aria-hidden />
        <div className="ppm__shell">
          <div className="ppm__luxury-ring">{visualCol}</div>
          <div className="ppm__copy">
            <div className="ppm__badge-slot ppm__badge-slot--above-title">{topBadge}</div>
            {saleCenter}
            {copyCore}
            {cta ? <div className="ppm__cta-row">{cta}</div> : null}
          </div>
        </div>
      </article>
    );
  }

  if (structure === "minimal_clean") {
    return (
      <article className={shellClass} dir="rtl" style={bgStyle}>
        {cornerRibbonEl}
        <div className="ppm__shell">
          {imgs.showForeground ? visualCol : null}
          <div className="ppm__copy">
            {topBadge}
            <h3 className="ppm__title" style={{ color: surface.titleColor }}>
              {truncateText(ad.title, 90)}
            </h3>
            {salePill}
            {cta}
          </div>
        </div>
      </article>
    );
  }

  if (structure === "product_focus") {
    return (
      <article className={shellClass} dir="rtl" style={bgStyle}>
        {cornerRibbonEl}
        <div className={decorClass} style={{ opacity: surface.decorOpacity ?? 0.5 }} aria-hidden />
        <div className="ppm__badge-slot ppm__badge-slot--tr">{topBadge}</div>
        <div className="ppm__shell">
          {visualCol}
          <div className="ppm__copy">
            {copyCore}
            {cta ? <div className="ppm__cta-row">{cta}</div> : null}
          </div>
        </div>
      </article>
    );
  }

  if (structure === "business_partner") {
    return (
      <article className={shellClass} dir="rtl" style={bgStyle}>
        {cornerRibbonEl}
        <div className={decorClass} style={{ opacity: surface.decorOpacity ?? 0.28 }} aria-hidden />
        <div className="ppm__badge-slot ppm__badge-slot--tr">{topBadge}</div>
        <div className="ppm__shell">
          {visualCol}
          <div className="ppm__copy">
            {copyCore}
            {cta ? <div className="ppm__cta-row">{cta}</div> : null}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={shellClass} dir="rtl" style={bgStyle}>
      {cornerRibbonEl}
      <div className={decorClass} style={{ opacity: surface.decorOpacity ?? 0.55 }} aria-hidden />
      <div className="ppm__badge-slot ppm__badge-slot--tr">{topBadge}</div>
      <div className="ppm__shell ppm__shell--split">
        <div className="ppm__copy">
          {copyCore}
          {isCornerRibbon && saleCircle ? <div className="ppm__sale-slot ppm__sale-slot--copy">{saleCircle}</div> : null}
          {cta ? <div className="ppm__cta-row">{cta}</div> : null}
        </div>
        {!isCornerRibbon ? <div className="ppm__split-divider" aria-hidden /> : null}
        {visualCol}
      </div>
    </article>
  );
}
