import { useId } from "react";

/**
 * Accessible toggle row (replaces crowded checkboxes).
 * @param {{
 *   label: string;
 *   description?: string;
 *   checked: boolean;
 *   disabled?: boolean;
 *   onChange: (next: boolean) => void;
 *   compact?: boolean;
 *   ariaLabel?: string;
 * }} p
 */
export default function PlanToggle({ label, description = "", checked, disabled = false, onChange, compact = false, ariaLabel = "" }) {
  const uid = useId();
  const inputId = `${uid}-plan-toggle`;
  const a11y = ariaLabel || label || "تبديل";

  if (compact || !label) {
    return (
      <span className={`oh-sapl-toggle oh-sapl-toggle--compact ${disabled ? "oh-sapl-toggle--disabled" : ""}`.trim()}>
        <span className="oh-sapl-toggle__track">
          <input
            id={inputId}
            type="checkbox"
            className="oh-sapl-toggle__input"
            role="switch"
            aria-label={a11y}
            aria-checked={checked}
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="oh-sapl-toggle__thumb" />
        </span>
      </span>
    );
  }

  return (
    <label className={`oh-sapl-toggle ${disabled ? "oh-sapl-toggle--disabled" : ""}`.trim()} htmlFor={inputId}>
      <div className="oh-sapl-toggle__text">
        <span className="oh-sapl-toggle__label">{label}</span>
        {description ? <span className="oh-sapl-toggle__desc">{description}</span> : null}
      </div>
      <span className="oh-sapl-toggle__track">
        <input
          id={inputId}
          type="checkbox"
          className="oh-sapl-toggle__input"
          role="switch"
          aria-checked={checked}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="oh-sapl-toggle__thumb" />
      </span>
    </label>
  );
}
