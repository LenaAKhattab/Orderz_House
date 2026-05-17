import HomePromoOfferCard from "../../components/ads/HomePromoOfferCard";
import { BANNER_META_ID } from "../../components/ads/bannerAdMeta";
import {
  BANNER_TEMPLATES_CONFIG,
  THEME_LABELS_AR,
  defaultAssetForTemplate,
  getTemplateConfig,
  getThemesForTemplate,
} from "../../components/ads/bannerDesignSystem";
import { applyTemplateSelection } from "./adFormUtils";
import { applyBannerColorPreset } from "./adBannerColorPresets";

/**
 * @param {object} draft
 * @param {string} templateId
 * @returns {import("../../types/ad.js").Ad}
 */
function buildMiniPreviewAd(draft, templateId) {
  const cfg = getTemplateConfig(templateId);
  const cp = draft.colorPreset || cfg.defaultColorPreset;
  const asset = draft.selectedAssetKey || defaultAssetForTemplate(templateId);
  const imageMode = asset ? "preset" : draft.imageMode || "none";

  return {
    id: "picker-inline",
    themePreset: templateId,
    title: draft.title?.trim() || "خصم 40% اليوم",
    subtitle: draft.subtitle?.trim() || "عرض محدود",
    description: draft.description?.trim() || "",
    companyName: draft.companyName?.trim() || "متجر هدايا",
    badgeText: draft.badgeText?.trim() || "عرض حصري",
    ctaText: draft.ctaText?.trim() || "احصل على العرض",
    ctaUrl: "#",
    openInNewTab: true,
    isClickableCard: false,
    images: draft.images?.length ? draft.images : [],
    texts: [
      {
        id: BANNER_META_ID,
        content: "",
        colorPreset: cp,
        salePercent: draft.salePercent ? Number(draft.salePercent) : 40,
        companyName: draft.companyName?.trim() || "متجر هدايا",
        imageMode,
        selectedAssetKey: asset || "",
        backgroundImageUrl: draft.backgroundImageUrl || "",
        showTopBadge: draft.showTopBadge !== false,
        showDiscountBadge: draft.showDiscountBadge !== false,
        ...(draft.discountText ? { discountText: draft.discountText } : {}),
      },
    ],
  };
}

function ThemeDots({ preset }) {
  return (
    <span className="oh-admin-ads__theme-swatch-dots" aria-hidden>
      <span className={`oh-admin-ads__theme-swatch-dot oh-admin-ads__theme-swatch-dot--${preset}`} />
      <span className={`oh-admin-ads__theme-swatch-dot oh-admin-ads__theme-swatch-dot--2 oh-admin-ads__theme-swatch-dot--${preset}`} />
      <span className={`oh-admin-ads__theme-swatch-dot oh-admin-ads__theme-swatch-dot--3 oh-admin-ads__theme-swatch-dot--${preset}`} />
    </span>
  );
}

/**
 * @param {{ data: object; onChange: (next: object) => void }} p
 */
export default function AdTemplateThemePicker({ data, onChange }) {
  const patch = (p) => onChange({ ...data, ...p });
  const themes = getThemesForTemplate(data.themePreset, data.colorPreset);

  return (
    <section className="oh-admin-ads__design-picker">
      <header className="oh-admin-ads__form-card-head">
        <h3 className="oh-admin-ads__form-card-title">التصميم والقالب</h3>
        <p className="oh-admin-ads__form-card-hint">اختر شكل البانر (تخطيط مختلف) ثم ثيم الألوان من القائمة أدناه</p>
      </header>

      <div className="oh-admin-ads__template-grid ad-template-grid">
        {BANNER_TEMPLATES_CONFIG.map((t) => {
          const selected = data.themePreset === t.id;
          const sample = buildMiniPreviewAd({ ...data, themePreset: t.id, colorPreset: t.defaultColorPreset }, t.id);
          return (
            <button
              key={t.id}
              type="button"
              className={`oh-admin-ads__template-tile${selected ? " oh-admin-ads__template-tile--active" : ""}`}
              aria-pressed={selected}
              onClick={() => patch(applyTemplateSelection(data, t.id))}
            >
              <span className="oh-admin-ads__template-tile-label">{t.label}</span>
              <span className="oh-admin-ads__template-tile-hint">{t.hint}</span>
              <div className="oh-admin-ads__template-tile-preview ad-template-card__preview" aria-hidden>
                <div className="oh-admin-ads__template-tile-preview-inner ad-template-card__preview-inner">
                  <HomePromoOfferCard ad={sample} previewMode />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="oh-admin-ads__theme-row">
        <span className="oh-admin-ads__field-label-spaced">ثيم الألوان</span>
        <div className="oh-admin-ads__theme-swatches theme-preset-list">
          {themes.map((th) => (
            <button
              key={th.value}
              type="button"
              className={`oh-admin-ads__theme-swatch theme-preset-chip${th.isActive ? " oh-admin-ads__theme-swatch--active" : ""}`}
              title={th.label}
              aria-pressed={th.isActive}
              onClick={() => patch(applyBannerColorPreset(data, th.value))}
            >
              <ThemeDots preset={th.value} />
              <span className="oh-admin-ads__theme-swatch-label">{THEME_LABELS_AR[th.value] || th.label}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

