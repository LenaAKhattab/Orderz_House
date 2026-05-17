import { useId } from "react";
import { PREMIUM_COLOR_DROPDOWN_OPTIONS } from "./adColorPalette";

function normHex(v) {
  return (v ?? "").toString().trim().toLowerCase();
}

/**
 * Compact color dropdown: swatch + name (+ optional hex in list).
 */
export default function AdFieldColorSelect({
  label,
  value = "",
  onChange,
  options = PREMIUM_COLOR_DROPDOWN_OPTIONS,
  disabled = false,
  showHexInList = true,
}) {
  const id = useId();
  const trimmed = (value || "").trim();
  const lower = normHex(trimmed);
  const matched = options.find((o) => (o.value === "" ? !trimmed : normHex(o.value) === lower));
  const displayHex = matched?.value || trimmed;
  const displayLabel = matched?.label || (trimmed ? "لون محفوظ" : "افتراضي");
  const isLight = displayHex && /^#f|^#e[def]|^#ff/i.test(displayHex);
  const selectOptions =
    trimmed && !matched
      ? [{ label: "لون محفوظ", value: trimmed }, ...options.filter((o) => normHex(o.value) !== lower)]
      : options;

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
          aria-label={label || "اختيار اللون"}
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
