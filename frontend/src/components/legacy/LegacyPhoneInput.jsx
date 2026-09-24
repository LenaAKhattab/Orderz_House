import { useId, useMemo } from "react";
import {
  DEFAULT_DIAL_CODE,
  dialCodeOptions,
  phonePlaceholderForDial,
} from "../../utils/legacyPhone";
import "./LegacyPhoneInput.css";

/**
 * Shared Legacy freelancer phone control:
 * physical LEFT = country dial selector, RIGHT = local number (LTR group inside RTL forms).
 */
export default function LegacyPhoneInput({
  id,
  countryCode = DEFAULT_DIAL_CODE,
  number = "",
  onCountryCodeChange,
  onNumberChange,
  required = false,
  disabled = false,
  variant = "auth",
  className = "",
  "aria-labelledby": ariaLabelledBy,
}) {
  const autoId = useId();
  const baseId = id || `legacy-phone-${autoId}`;
  const ccId = `${baseId}-cc`;
  const numId = `${baseId}-number`;
  const options = useMemo(() => dialCodeOptions(), []);
  const selected = options.find((o) => o.value === countryCode) || options.find((o) => o.value === DEFAULT_DIAL_CODE);
  const placeholder = phonePlaceholderForDial(countryCode || DEFAULT_DIAL_CODE);
  const variantClass = variant === "admin" ? "oh-legacy-phone--admin" : "";

  return (
    <div
      className={["oh-legacy-phone", variantClass, className].filter(Boolean).join(" ")}
      dir="ltr"
      data-testid="legacy-phone-input"
      aria-labelledby={ariaLabelledBy}
    >
      <label className="oh-legacy-phone__cc-wrap" htmlFor={ccId}>
        <span className="oh-legacy-phone__sr">مفتاح الدولة</span>
        <select
          id={ccId}
          className="oh-legacy-phone__cc"
          value={selected?.value || DEFAULT_DIAL_CODE}
          required={required}
          disabled={disabled}
          aria-label="مفتاح الدولة"
          data-testid="legacy-phone-country"
          onChange={(e) => onCountryCodeChange?.(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} title={o.label}>
              {o.compactLabel}
            </option>
          ))}
        </select>
      </label>
      <label className="oh-legacy-phone__number-wrap" htmlFor={numId}>
        <span className="oh-legacy-phone__sr">رقم الهاتف المحلي</span>
        <input
          id={numId}
          className="oh-legacy-phone__number"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          dir="ltr"
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          value={number}
          data-testid="legacy-phone-number"
          onChange={(e) => onNumberChange?.(e.target.value)}
        />
      </label>
    </div>
  );
}
