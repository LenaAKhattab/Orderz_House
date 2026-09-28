import { useMemo, useState } from "react";
import HomePromoOfferCard from "../../components/ads/HomePromoOfferCard";
import { BANNER_META_ID } from "../../components/ads/bannerAdMeta";
import {
  BANNER_TEMPLATES_CONFIG,
  defaultAssetForTemplate,
  resolveBannerTemplateHint,
  resolveBannerTemplateLabel,
} from "../../components/ads/bannerDesignSystem";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/adsResources";

function buildPickerSampleAd(templateId, demo) {
  const cfg = BANNER_TEMPLATES_CONFIG.find((t) => t.id === templateId) || BANNER_TEMPLATES_CONFIG[0];
  const asset = defaultAssetForTemplate(templateId);
  return {
    id: `picker-sample-${templateId}`,
    themePreset: templateId,
    title: demo.title,
    subtitle: demo.subtitle,
    description: "",
    companyName: demo.companyName,
    badgeText: demo.badgeText,
    ctaText: demo.ctaText,
    ctaUrl: "/",
    openInNewTab: true,
    isClickableCard: false,
    images: [],
    texts: [
      {
        id: BANNER_META_ID,
        content: "",
        colorPreset: cfg.defaultColorPreset,
        salePercent: 40,
        companyName: demo.companyName,
        imageMode: asset ? "preset" : "none",
        selectedAssetKey: asset || "",
        showTopBadge: true,
        showDiscountBadge: true,
      },
    ],
  };
}

/** @param {{ open: boolean; onCancel: () => void; onConfirm: (templateId: string) => void }} p */
export default function AdTemplatePickerModal({ open, onCancel, onConfirm }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(/** @type {string | null} */ (null));

  const demo = useMemo(
    () => ({
      title: t("ads.preview.templateDemo.title"),
      subtitle: t("ads.preview.templateDemo.subtitle"),
      companyName: t("ads.preview.templateDemo.companyName"),
      badgeText: t("ads.preview.templateDemo.badgeText"),
      ctaText: t("ads.preview.templateDemo.ctaText"),
    }),
    [t],
  );

  if (!open) return null;

  const canNext = Boolean(selected);

  return (
    <div className="oh-admin-ads__modal oh-admin-ads__template-picker" role="dialog" aria-modal="true" aria-labelledby="ad-template-picker-title">
      <div className="oh-admin-ads__modal-card oh-admin-ads__template-picker-card">
        <header className="oh-admin-ads__template-picker-head">
          <h2 id="ad-template-picker-title" className="oh-admin-ads__template-picker-title">
            {t("ads.form.pickBannerShape")}
          </h2>
          <p className="oh-admin-ads__template-picker-sub">{t("ads.form.pickBannerSub")}</p>
        </header>

        <div className="oh-admin-ads__template-picker-scroll">
          <div className="oh-admin-ads__template-picker-grid oh-admin-ads__template-picker-grid--6">
            {BANNER_TEMPLATES_CONFIG.map((row) => {
              const isSel = selected === row.id;
              const sample = buildPickerSampleAd(row.id, demo);
              return (
                <button
                  key={row.id}
                  type="button"
                  className={`oh-admin-ads__template-picker-choice${isSel ? " oh-admin-ads__template-picker-choice--selected" : ""}`}
                  aria-pressed={isSel}
                  onClick={() => setSelected(row.id)}
                >
                  <span className="oh-admin-ads__template-picker-choice-label">{resolveBannerTemplateLabel(row, t)}</span>
                  <span className="oh-admin-ads__template-picker-choice-hint">{resolveBannerTemplateHint(row, t)}</span>
                  <div className="oh-admin-ads__template-picker-preview-wrap oh-admin-ads__template-picker__preview ad-template-card__preview" aria-hidden="true">
                    <div className="oh-admin-ads__template-picker-banner ad-template-card__preview-inner">
                      <HomePromoOfferCard ad={sample} previewMode />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <footer className="oh-admin-ads__template-picker-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {t("ads.common.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canNext}
            onClick={() => {
              if (!selected) return;
              onConfirm(selected);
            }}
          >
            {t("ads.common.next")}
          </button>
        </footer>
      </div>
    </div>
  );
}
