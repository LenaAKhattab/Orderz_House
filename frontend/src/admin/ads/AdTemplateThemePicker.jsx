import HomePromoOfferCard from "../../components/ads/HomePromoOfferCard";
import { BANNER_META_ID } from "../../components/ads/bannerAdMeta";
import {
  BANNER_TEMPLATES_CONFIG,
  defaultAssetForTemplate,
  getTemplateConfig,
  getThemesForTemplate,
  resolveBannerTemplateHint,
  resolveBannerTemplateLabel,
} from "../../components/ads/bannerDesignSystem";
import { applyTemplateSelection } from "./adFormUtils";
import { applyBannerColorPreset } from "./adBannerColorPresets";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/adsResources";

/**
 * @param {object} draft
 * @param {string} templateId
 * @returns {import("../../types/ad.js").Ad}
 */
function buildMiniPreviewAd(draft, templateId, demo) {
  const cfg = getTemplateConfig(templateId);
  const cp = draft.colorPreset || cfg.defaultColorPreset;
  const asset = draft.selectedAssetKey || defaultAssetForTemplate(templateId);
  const imageMode = asset ? "preset" : draft.imageMode || "none";

  return {
    id: "picker-inline",
    themePreset: templateId,
    title: draft.title?.trim() || demo.title,
    subtitle: draft.subtitle?.trim() || demo.subtitle,
    description: draft.description?.trim() || "",
    companyName: draft.companyName?.trim() || demo.companyName,
    badgeText: draft.badgeText?.trim() || demo.badgeText,
    ctaText: draft.ctaText?.trim() || demo.ctaText,
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
        companyName: draft.companyName?.trim() || demo.companyName,
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
  const { t } = useTranslation();
  const patch = (p) => onChange({ ...data, ...p });
  const themes = getThemesForTemplate(data.themePreset, data.colorPreset, t);
  const demo = {
    title: t("ads.preview.templateDemo.title"),
    subtitle: t("ads.preview.templateDemo.subtitle"),
    companyName: t("ads.preview.templateDemo.companyName"),
    badgeText: t("ads.preview.templateDemo.badgeText"),
    ctaText: t("ads.preview.templateDemo.ctaText"),
  };

  return (
    <section className="oh-admin-ads__design-picker">
      <header className="oh-admin-ads__form-card-head">
        <h3 className="oh-admin-ads__form-card-title">{t("ads.form.designTemplateTitle")}</h3>
        <p className="oh-admin-ads__form-card-hint">{t("ads.form.designTemplateHint")}</p>
      </header>

      <div className="oh-admin-ads__template-grid ad-template-grid">
        {BANNER_TEMPLATES_CONFIG.map((tpl) => {
          const selected = data.themePreset === tpl.id;
          const sample = buildMiniPreviewAd({ ...data, themePreset: tpl.id, colorPreset: tpl.defaultColorPreset }, tpl.id, demo);
          return (
            <button
              key={tpl.id}
              type="button"
              className={`oh-admin-ads__template-tile${selected ? " oh-admin-ads__template-tile--active" : ""}`}
              aria-pressed={selected}
              onClick={() => patch(applyTemplateSelection(data, tpl.id))}
            >
              <span className="oh-admin-ads__template-tile-label">{resolveBannerTemplateLabel(tpl, t)}</span>
              <span className="oh-admin-ads__template-tile-hint">{resolveBannerTemplateHint(tpl, t)}</span>
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
        <span className="oh-admin-ads__field-label-spaced">{t("ads.form.colorTheme")}</span>
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
              <span className="oh-admin-ads__theme-swatch-label">{th.label}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

