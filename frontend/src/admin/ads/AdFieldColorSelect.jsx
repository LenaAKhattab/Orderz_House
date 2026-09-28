import { useId, useMemo } from "react";
import { PREMIUM_COLOR_DROPDOWN_OPTIONS } from "./adColorPalette";
import { mapPaletteOptions } from "./adsLocaleHelpers";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/adsResources";

function normHex(v) {
  return (v ?? "").toString().trim().toLowerCase();
}

export default function AdFieldColorSelect({
  label,
  value = "",
  onChange,
  options = PREMIUM_COLOR_DROPDOWN_OPTIONS,
  disabled = false,
  showHexInList = true,
}) {
  const { t } = useTranslation();
  const id = useId();
  const resolvedOptions = useMemo(() => mapPaletteOptions(options, t), [options, t]);
  const trimmed = (value || "").trim();
  const lower = normHex(trimmed);
  const matched = resolvedOptions.find((o) => (o.value === "" ? !trimmed : normHex(o.value) === lower));
  const displayHex = matched?.value || trimmed;
  const displayLabel = matched?.label || (trimmed ? t("ads.palette.savedColor") : t("ads.palette.default"));
  const isLight = displayHex && /^#f|^#e[def]|^#ff/i.test(displayHex);
  const selectOptions =
    trimmed && !matched
      ? [{ label: t("ads.palette.savedColor"), value: trimmed }, ...resolvedOptions.filter((o) => normHex(o.value) !== lower)]
      : resolvedOptions;

  return (
    <div className="oh-admin-field-color">
      {label ? (
        <span className="oh-admin-field-color__label" id={id}>
          {label}
        </span>
      ) : null}
      <div className="oh-admin-field-color__control">
        <span
          className={`oh-admin-field-color__swatch${isLight ? " oh-admin-field-color__swatch--light" : ""}${!displayHex ? " oh-admin-field-color__swatch--empty" : ""}`}
          style={displayHex ? { background: displayHex } : undefined}
          aria-hidden
        />
        <select
          className="oh-admin-field-color__select"
          value={trimmed}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-labelledby={label ? id : undefined}
          aria-label={label || t("ads.colors.pickColorAria")}
          title={displayHex ? `${displayLabel} ${displayHex}` : displayLabel}
        >
          {selectOptions.map((opt) => (
            <option key={opt.value || "__default"} value={opt.value}>
              {opt.label}
              {showHexInList && opt.value ? ` · ${opt.value}` : ""}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
