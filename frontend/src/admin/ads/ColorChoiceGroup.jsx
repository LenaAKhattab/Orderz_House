import { useMemo } from "react";
import { toPickerHex } from "./adColorPalette";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/adsResources";

/**
 * Visual color selection: swatches + optional clear + native picker under custom color.
 */
export default function ColorChoiceGroup({
  label,
  value = "",
  onChange,
  options,
  allowEmpty = false,
  emptyLabel,
  disabled = false,
  showHex = true,
}) {
  const { t } = useTranslation();
  const resolvedEmptyLabel = emptyLabel ?? t("ads.palette.unset");
  const trimmed = (value || "").trim();
  const lower = trimmed.toLowerCase();
  const matched = options.find((o) => o.value.toLowerCase() === lower);

  const summaryLabel = useMemo(() => {
    if (!trimmed && allowEmpty) return resolvedEmptyLabel;
    if (matched) return matched.label;
    if (trimmed) return t("ads.palette.customColor");
    return resolvedEmptyLabel;
  }, [trimmed, matched, allowEmpty, resolvedEmptyLabel, t]);

  const isLightSwatch = (hex) => {
    if (!hex || hex.toLowerCase() === "#ffffff") return true;
    return /^#f|^#e[def]|^#ff/i.test(hex);
  };

  return (
    <div className="oh-admin-color-field">
      <div className="oh-admin-color-field__header">
        <span className="oh-admin-color-field__title">{label}</span>
        <div className="oh-admin-color-field__current">
          {trimmed ? (
            <>
              <span
                className={`oh-admin-color-dot ${isLightSwatch(trimmed) ? "oh-admin-color-dot--light" : ""}`}
                style={{ background: trimmed }}
                title={trimmed}
              />
              <span className="oh-admin-color-field__name">{summaryLabel}</span>
              {showHex ? <code className="oh-admin-color-hex">{trimmed}</code> : null}
            </>
          ) : (
            <span className="oh-admin-color-field__muted">{resolvedEmptyLabel}</span>
          )}
        </div>
      </div>

      <div className="oh-admin-color-swatches" role="group" aria-label={label}>
        {allowEmpty ? (
          <button
            type="button"
            className={`oh-admin-color-chip ${!trimmed ? "oh-admin-color-chip--selected" : ""}`}
            disabled={disabled}
            onClick={() => onChange("")}
          >
            {resolvedEmptyLabel}
          </button>
        ) : null}
        {options.map((opt) => {
          const selected = lower === opt.value.toLowerCase();
          const light = isLightSwatch(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              title={opt.label}
              aria-label={opt.label}
              aria-pressed={selected}
              className={`oh-admin-color-swatch ${selected ? "oh-admin-color-swatch--selected" : ""} ${light ? "oh-admin-color-swatch--light" : ""}`}
              style={{ background: opt.value }}
              onClick={() => onChange(opt.value)}
            />
          );
        })}
      </div>

      <details className="oh-admin-color-advanced">
        <summary className="oh-admin-color-advanced__summary">{t("ads.palette.customColor")}</summary>
        <div className="oh-admin-color-advanced__body">
          <label className="oh-admin-color-picker-wrap">
            <span className="oh-admin-color-field__muted">{t("ads.colors.colorPicker")}</span>
            <input
              type="color"
              className="oh-admin-color-native"
              disabled={disabled}
              value={toPickerHex(trimmed)}
              onChange={(e) => onChange(e.target.value)}
            />
          </label>
          {!matched && trimmed && /^#/i.test(trimmed) ? (
            <span className="oh-admin-color-field__muted oh-admin-color-field__muted--narrow">{t("ads.colors.customColorHint")}</span>
          ) : null}
        </div>
      </details>
    </div>
  );
}
