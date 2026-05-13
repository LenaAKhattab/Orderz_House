import { useId } from "react";
import { BASIC_FIELD_COLOR_OPTIONS } from "./adColorPalette";

function normHex(v) {
  return (v ?? "").toString().trim().toLowerCase();
}

/**
 * Compact inline color dots — افتراضي first, then swatches. No hex inputs.
 *
 * @param {object} p
 * @param {string} p.label — e.g. لون العنوان
 * @param {string} [p.value]
 * @param {(next: string) => void} p.onChange
 * @param {{ label: string, value: string }[]} [p.options]
 * @param {boolean} [p.disabled]
 */
export default function InlineColorDots({
  label,
  value = "",
  onChange,
  options = BASIC_FIELD_COLOR_OPTIONS,
  disabled = false,
}) {
  const baseId = useId();
  const trimmed = (value || "").trim();
  const lower = normHex(trimmed);

  const isLightSwatch = (hex) => {
    if (!hex || hex.toLowerCase() === "#ffffff") return true;
    return /^#f|^#e[def]|^#ff/i.test(hex);
  };

  const isKnown = options.some((o) => (o.value === "" ? !trimmed : normHex(o.value) === lower));

  return (
    <div className="oh-admin-inline-colors">
      <span className="oh-admin-inline-colors__label" id={baseId}>
        {label}
      </span>
      <div className="oh-admin-inline-colors__row" role="group" aria-labelledby={baseId}>
        {options.map((opt) => {
          const isDefault = opt.value === "";
          const selected = isDefault ? !trimmed : lower === normHex(opt.value);
          if (isDefault) {
            return (
              <button
                key="default"
                type="button"
                disabled={disabled}
                title={opt.label}
                aria-label={opt.label}
                aria-pressed={selected}
                className={`oh-admin-inline-colors__chip ${selected ? "oh-admin-inline-colors__chip--selected" : ""}`}
                onClick={() => onChange("")}
              >
                {opt.label}
              </button>
            );
          }
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              title={opt.label}
              aria-label={opt.label}
              aria-pressed={selected}
              className={`oh-admin-inline-colors__dot ${selected ? "oh-admin-inline-colors__dot--selected" : ""} ${
                isLightSwatch(opt.value) ? "oh-admin-inline-colors__dot--light" : ""
              }`}
              style={{ background: opt.value }}
              onClick={() => onChange(opt.value)}
            >
              {selected ? (
                <span className="oh-admin-inline-colors__check" aria-hidden>
                  ✓
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {trimmed && !isKnown ? (
        <p className="oh-admin-inline-colors__note" role="status">
          لون محفوظ غير مدرج في القائمة — لا يزال يظهر في المعاينة والصفحة العامة كما هو.
        </p>
      ) : null}
    </div>
  );
}
