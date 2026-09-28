import { useMemo } from "react";
import { STYLE_PRESETS } from "./adFormConstants";
import ColorChoiceGroup from "./ColorChoiceGroup";
import CompactSwatchRow from "./CompactSwatchRow";
import {
  COLOR_SWATCHES_BORDER,
  COLOR_SWATCHES_BUTTON_TEXT,
  COLOR_SWATCHES_SOFT_BG,
  GRADIENT_QUICK_PRESETS,
  MAIN_SIMPLE_SWATCHES,
  pickContrastButtonText,
} from "./adColorPalette";
import { mapGradientPresets, mapPaletteOptions } from "./adsLocaleHelpers";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/adsResources";

const PRESET_STRIP_KEYS = ["backgroundColor", "buttonColor"];

function norm(v) {
  return (v ?? "").toString().trim().toLowerCase();
}

function matchesPreset(current, presetColors) {
  return Object.keys(presetColors).every((k) => norm(current[k]) === norm(presetColors[k]));
}

/** @param {{ value: object, onChange: (next: object) => void, disabled?: boolean }} props */
export default function AdColorControls({ value, onChange, disabled }) {
  const { t } = useTranslation();
  const v = value || {};
  const mainSwatches = useMemo(() => mapPaletteOptions(MAIN_SIMPLE_SWATCHES, t), [t]);
  const borderSwatches = useMemo(() => mapPaletteOptions(COLOR_SWATCHES_BORDER, t), [t]);
  const buttonTextSwatches = useMemo(() => mapPaletteOptions(COLOR_SWATCHES_BUTTON_TEXT, t), [t]);
  const softBgSwatches = useMemo(() => mapPaletteOptions(COLOR_SWATCHES_SOFT_BG, t), [t]);
  const gradientPresets = useMemo(() => mapGradientPresets(GRADIENT_QUICK_PRESETS, t), [t]);

  const patch = (partial) => onChange({ ...v, ...partial });

  const applyPreset = (preset) => {
    onChange({ ...v, ...preset.colors });
  };

  const resetColors = () => {
    onChange({
      ...v,
      backgroundColor: "",
      titleColor: "",
      textColor: "",
      buttonColor: "",
      buttonTextColor: "",
      borderColor: "",
      badgeColor: "",
      gradientFrom: "",
      gradientTo: "",
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

  const applyGradientPreset = (g) => {
    patch({ gradientFrom: g.gradientFrom, gradientTo: g.gradientTo });
  };

  return (
    <div className="oh-admin-ads__color-stack oh-admin-ads__color-stack--simple">
      <p className="oh-admin-ads__helperText oh-admin-ads__helperText--tight">{t("ads.colors.controlsHint")}</p>

      <p className="oh-admin-ads__color-section-label">{t("ads.colors.pickPreset")}</p>
      <div className="oh-admin-preset-grid">
        {STYLE_PRESETS.map((p) => {
          const selected = matchesPreset(v, p.colors);
          return (
            <button
              key={p.id}
              type="button"
              className={`oh-admin-preset-card ${selected ? "oh-admin-preset-card--selected" : ""}`}
              disabled={disabled}
              onClick={() => applyPreset(p)}
            >
              <span className="oh-admin-preset-card__name">{t(`ads.stylePresets.${p.presetKey}`)}</span>
              <div className="oh-admin-preset-card__strip" aria-hidden>
                {PRESET_STRIP_KEYS.map((key) => (
                  <span key={key} className="oh-admin-preset-card__sw" style={{ background: p.colors[key] || "#e5e7eb" }} />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <div className="oh-admin-ads__preset-actions">
        <button type="button" className="btn btn-secondary" disabled={disabled} onClick={resetColors}>
          {t("ads.colors.resetColors")}
        </button>
      </div>

      <p className="oh-admin-ads__color-section-label">{t("ads.colors.customizeCard")}</p>
      <div className="oh-admin-color-quick">
        <CompactSwatchRow
          label={t("ads.colors.adBackground")}
          value={v.backgroundColor}
          onChange={(hex) => patch({ backgroundColor: hex })}
          options={mainSwatches}
          allowEmpty
          disabled={disabled}
        />
        <CompactSwatchRow
          label={t("ads.colors.buttonColor")}
          value={v.buttonColor}
          onChange={setButtonColor}
          options={mainSwatches}
          allowEmpty
          disabled={disabled}
        />
      </div>

      <details className="oh-admin-colors-advanced-block">
        <summary className="oh-admin-colors-advanced-block__summary">{t("ads.form.advancedOptions")}</summary>
        <div className="oh-admin-colors-advanced-block__body">
          <p className="oh-admin-ads__helperText oh-admin-ads__helperText--tight">{t("ads.colors.advancedBorderHint")}</p>

          <div className="oh-admin-color-sections">
            <ColorChoiceGroup
              label={t("ads.colors.cardBorder")}
              value={v.borderColor}
              onChange={(next) => patch({ borderColor: next })}
              options={borderSwatches}
              allowEmpty
              disabled={disabled}
              showHex={false}
            />
            <ColorChoiceGroup
              label={t("ads.colors.buttonTextOverride")}
              value={v.buttonTextColor}
              onChange={(next) => patch({ buttonTextColor: next })}
              options={buttonTextSwatches}
              allowEmpty
              emptyLabel={t("ads.colors.autoFromButton")}
              disabled={disabled}
              showHex={false}
            />
          </div>

          <div className="oh-admin-gradient-block oh-admin-gradient-block--nested">
            <h4 className="oh-admin-gradient-block__title">{t("ads.colors.gradientTitle")}</h4>
            <p className="oh-admin-ads__helperText oh-admin-gradient-block__hint">{t("ads.colors.gradientHint")}</p>
            <div className="oh-admin-gradient-quick" role="group" aria-label={t("ads.colors.gradientQuickAria")}>
              {gradientPresets.map((g) => {
                const sel = norm(v.gradientFrom) === norm(g.gradientFrom) && norm(v.gradientTo) === norm(g.gradientTo);
                const isClear = !g.gradientFrom && !g.gradientTo;
                return (
                  <button
                    key={g.name}
                    type="button"
                    disabled={disabled}
                    className={`oh-admin-gradient-chip ${sel ? "oh-admin-gradient-chip--selected" : ""}`}
                    onClick={() => applyGradientPreset(g)}
                  >
                    {isClear ? (
                      <span>{g.label}</span>
                    ) : (
                      <>
                        <span className="oh-admin-gradient-chip__dots" aria-hidden>
                          <span style={{ background: g.gradientFrom }} />
                          <span style={{ background: g.gradientTo }} />
                        </span>
                        <span>{g.label}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="oh-admin-gradient-fine">
              <ColorChoiceGroup
                label={t("ads.colors.gradientStart")}
                value={v.gradientFrom}
                onChange={(next) => patch({ gradientFrom: next })}
                options={softBgSwatches}
                allowEmpty
                disabled={disabled}
                showHex={false}
              />
              <ColorChoiceGroup
                label={t("ads.colors.gradientEnd")}
                value={v.gradientTo}
                onChange={(next) => patch({ gradientTo: next })}
                options={softBgSwatches}
                allowEmpty
                disabled={disabled}
                showHex={false}
              />
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
