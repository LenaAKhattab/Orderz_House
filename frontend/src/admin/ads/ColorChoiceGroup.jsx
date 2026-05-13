import { useMemo } from "react";
import { toPickerHex } from "./adColorPalette";

/**
 * Visual color selection: swatches + optional clear + native picker under «لون مخصص».
 * Values remain hex strings for the form (same as backend).
 *
 * @param {object} p
 * @param {string} p.label — Arabic field title
 * @param {string} [p.value]
 * @param {(next: string) => void} p.onChange
 * @param {{ label: string, value: string }[]} p.options
 * @param {boolean} [p.allowEmpty]
 * @param {string} [p.emptyLabel]
 * @param {boolean} [p.disabled]
 * @param {boolean} [p.showHex] — show hex code next to current (default true)
 */
export default function ColorChoiceGroup({
  label,
  value = "",
  onChange,
  options,
  allowEmpty = false,
  emptyLabel = "بدون تحديد",
  disabled = false,
  showHex = true,
}) {
  const trimmed = (value || "").trim();
  const lower = trimmed.toLowerCase();
  const matched = options.find((o) => o.value.toLowerCase() === lower);

  const summaryLabel = useMemo(() => {
    if (!trimmed && allowEmpty) return emptyLabel;
    if (matched) return matched.label;
    if (trimmed) return "لون مخصص";
    return emptyLabel;
  }, [trimmed, matched, allowEmpty, emptyLabel]);

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
            <span className="oh-admin-color-field__muted">{emptyLabel}</span>
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
            {emptyLabel}
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
        <summary className="oh-admin-color-advanced__summary">لون مخصص</summary>
        <div className="oh-admin-color-advanced__body">
          <label className="oh-admin-color-picker-wrap">
            <span className="oh-admin-color-field__muted">منتقي الألوان</span>
            <input
              type="color"
              className="oh-admin-color-native"
              disabled={disabled}
              value={toPickerHex(trimmed)}
              onChange={(e) => onChange(e.target.value)}
            />
          </label>
          {!matched && trimmed && /^#/i.test(trimmed) ? (
            <span className="oh-admin-color-field__muted oh-admin-color-field__muted--narrow">
              يمكنك ضبط اللون بدقة ثم العودة إلى السِلم أعلاه إذا يطابق أحد الخيارات.
            </span>
          ) : null}
        </div>
      </details>
    </div>
  );
}
