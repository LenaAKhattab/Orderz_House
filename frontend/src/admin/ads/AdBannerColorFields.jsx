import { useMemo } from "react";
import { COLOR_PRESET_DB_PATCH } from "../../components/ads/homeOffersTheme";
import { PREMIUM_THEME_EXTRAS } from "../../components/ads/bannerDesignSystem";
import CompactSwatchRow from "./CompactSwatchRow";
import { MAIN_SIMPLE_SWATCHES, pickContrastButtonText } from "./adColorPalette";
import { mapPaletteOptions } from "./adsLocaleHelpers";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/adsResources";

const QUICK_PRESET_KEYS = ["blue_white", "cream_navy", "red_sale", "navy_gold", "green_nature"];

function norm(v) {
  return (v ?? "").toString().trim().toLowerCase();
}

/** @param {{ data: object, onChange: (next: object) => void }} props */
export default function AdBannerColorFields({ data, onChange }) {
  const { t } = useTranslation();
  const swatches = useMemo(() => mapPaletteOptions(MAIN_SIMPLE_SWATCHES, t), [t]);
  const patch = (p) => onChange({ ...data, ...p });

  const applyQuickPreset = (key) => {
    const p = COLOR_PRESET_DB_PATCH[key] || COLOR_PRESET_DB_PATCH.blue_white;
    const extras = PREMIUM_THEME_EXTRAS[key] || {};
    patch({
      colorPreset: key,
      gradientFrom: p.gradientFrom || "",
      gradientTo: p.gradientTo || "",
      titleColor: p.titleColor || "",
      textColor: p.textColor || "",
      buttonColor: p.buttonColor || "",
      buttonTextColor: p.buttonTextColor || "",
      badgeColor: p.badgeColor || "",
      badgeTextColor: p.badgeTextColor || "",
      borderColor: p.borderColor || "",
      backgroundColor: p.backgroundColor || "",
      saleStickerBg: extras.saleStickerBg || "",
      saleStickerFg: extras.saleStickerFg || "",
    });
  };

  const setButtonColor = (hex) => {
    if (!hex) {
      patch({ buttonColor: "", buttonTextColor: "" });
      return;
    }
    patch({
      buttonColor: hex,
      buttonTextColor: pickContrastButtonText(hex),
    });
  };

  return (
    <section className="oh-admin-ads__form-card">
      <header className="oh-admin-ads__form-card-head">
        <h3 className="oh-admin-ads__form-card-title">{t("ads.colors.sectionTitle")}</h3>
        <p className="oh-admin-ads__form-card-hint">{t("ads.colors.sectionHint")}</p>
      </header>

      <div className="oh-admin-ads__builder-grid">
        <div className="oh-admin-ads__field oh-admin-ads__field--full">
          <span className="oh-admin-ads__field-label-spaced">{t("ads.colors.quickPick")}</span>
          <div className="oh-admin-gradient-quick" role="group" aria-label={t("ads.colors.quickPickAria")}>
            {QUICK_PRESET_KEYS.map((key) => {
              const selected = norm(data.colorPreset) === norm(key);
              const p = COLOR_PRESET_DB_PATCH[key];
              return (
                <button
                  key={key}
                  type="button"
                  className={`oh-admin-gradient-chip${selected ? " oh-admin-gradient-chip--selected" : ""}`}
                  onClick={() => applyQuickPreset(key)}
                >
                  <span className="oh-admin-gradient-chip__dots" aria-hidden>
                    <span style={{ background: p?.gradientFrom || "#1e3a8a" }} />
                    <span style={{ background: p?.gradientTo || "#2563eb" }} />
                  </span>
                  <span>{t(`ads.bannerColorPresets.${key}`)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <CompactSwatchRow
          label={t("ads.colors.bgPrimary")}
          value={data.gradientFrom}
          onChange={(hex) => patch({ gradientFrom: hex })}
          options={swatches}
          allowEmpty
          emptyLabel={t("ads.palette.none")}
        />
        <CompactSwatchRow
          label={t("ads.colors.bgSecondary")}
          value={data.gradientTo}
          onChange={(hex) => patch({ gradientTo: hex })}
          options={swatches}
          allowEmpty
          emptyLabel={t("ads.palette.none")}
        />
        <CompactSwatchRow
          label={t("ads.colors.mainText")}
          value={data.titleColor}
          onChange={(hex) => patch({ titleColor: hex })}
          options={swatches}
          allowEmpty
          emptyLabel={t("ads.palette.default")}
        />
        <CompactSwatchRow
          label={t("ads.colors.subText")}
          value={data.textColor}
          onChange={(hex) => patch({ textColor: hex })}
          options={swatches}
          allowEmpty
          emptyLabel={t("ads.palette.default")}
        />
        <CompactSwatchRow
          label={t("ads.colors.ctaButton")}
          value={data.buttonColor}
          onChange={setButtonColor}
          options={swatches}
          allowEmpty
          emptyLabel={t("ads.palette.none")}
        />
        <CompactSwatchRow
          label={t("ads.colors.ctaButtonText")}
          value={data.buttonTextColor}
          onChange={(hex) => patch({ buttonTextColor: hex })}
          options={swatches}
          allowEmpty
          emptyLabel={t("ads.palette.auto")}
        />
        <CompactSwatchRow
          label={t("ads.colors.badge")}
          value={data.badgeColor}
          onChange={(hex) => patch({ badgeColor: hex })}
          options={swatches}
          allowEmpty
          emptyLabel={t("ads.palette.default")}
        />
        <CompactSwatchRow
          label={t("ads.colors.badgeText")}
          value={data.badgeTextColor}
          onChange={(hex) => patch({ badgeTextColor: hex })}
          options={swatches}
          allowEmpty
          emptyLabel={t("ads.palette.default")}
        />
        <CompactSwatchRow
          label={t("ads.colors.saleCircle")}
          value={data.saleStickerBg}
          onChange={(hex) => patch({ saleStickerBg: hex })}
          options={swatches}
          allowEmpty
          emptyLabel={t("ads.palette.default")}
        />
        <CompactSwatchRow
          label={t("ads.colors.saleCircleText")}
          value={data.saleStickerFg}
          onChange={(hex) => patch({ saleStickerFg: hex })}
          options={swatches}
          allowEmpty
          emptyLabel={t("ads.palette.default")}
        />
      </div>
    </section>
  );
}
