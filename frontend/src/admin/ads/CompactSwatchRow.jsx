/**
 * Compact horizontal swatches — short admin rows without hex emphasis.
 * @param {object} p
 * @param {string} p.label
 * @param {string} [p.value]
 * @param {(next: string) => void} p.onChange
 * @param {{ label: string, value: string }[]} p.options
 * @param {boolean} [p.allowEmpty]
 * @param {string} [p.emptyLabel]
 * @param {boolean} [p.disabled]
 * @param {'md' | 'sm'} [p.size]
 */
export default function CompactSwatchRow({
  label,
  value = "",
  onChange,
  options,
  allowEmpty = false,
  emptyLabel = "بدون تحديد",
  disabled = false,
  size = "md",
}) {
  const trimmed = (value || "").trim();
  const lower = trimmed.toLowerCase();
  const matched = options.some((o) => o.value.toLowerCase() === lower);
  const swatchClass = size === "sm" ? "oh-admin-color-swatch oh-admin-color-swatch--compact-sm" : "oh-admin-color-swatch oh-admin-color-swatch--compact";

  const isLightSwatch = (hex) => {
    if (!hex || hex.toLowerCase() === "#ffffff") return true;
    return /^#f|^#e[def]|^#ff/i.test(hex);
  };

  return (
    <div className={`oh-admin-color-compact-row oh-admin-color-compact-row--${size}`}>
      <span className="oh-admin-color-compact-row__label">{label}</span>
      <div className="oh-admin-color-compact-row__swatches" role="group" aria-label={label}>
        {allowEmpty ? (
          <button
            type="button"
            className={`oh-admin-color-chip oh-admin-color-chip--compact ${!trimmed ? "oh-admin-color-chip--selected" : ""}`}
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
              className={`${swatchClass} ${selected ? "oh-admin-color-swatch--selected" : ""} ${light ? "oh-admin-color-swatch--light" : ""}`}
              style={{ background: opt.value }}
              onClick={() => onChange(opt.value)}
            />
          );
        })}
      </div>
      {trimmed && !matched ? (
        <p className="oh-admin-color-compact-row__note">لون محفوظ غير مدرج أعلاه — يظهر في المعاينة؛ يمكن ضبطه من «خيارات متقدمة».</p>
      ) : null}
    </div>
  );
}
