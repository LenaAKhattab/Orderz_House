import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "../../i18n/LanguageProvider";
import "./legacySmartFields.css";

/**
 * Searchable combobox for Legacy registration (city / year / similar).
 * When allowOther is true, selecting Other reveals a free-text input;
 * parent value is always the real stored string (never the Other sentinel).
 */
export default function LegacySearchableSelect({
  id,
  value = "",
  onChange,
  options = [],
  extraOptions = [],
  allowOther = false,
  otherValue = "__other__",
  otherLabel,
  otherInputLabel,
  required = false,
  disabled = false,
  placeholder,
  className = "",
  inputClassName = "",
  dir = "rtl",
  "aria-label": ariaLabel,
}) {
  const { t } = useTranslation();
  const resolvedOtherLabel = otherLabel ?? t("legacy.common.other");
  const resolvedOtherInputLabel = otherInputLabel ?? t("legacy.common.writeValue");
  const resolvedPlaceholder = placeholder ?? t("legacy.common.select");
  const autoId = useId();
  const inputId = id || `legacy-select-${autoId}`;
  const listId = `${inputId}-list`;
  const rootRef = useRef(null);

  const mergedOptions = useMemo(() => {
    const map = new Map();
    for (const o of [...options, ...extraOptions]) {
      if (!o || o.value == null) continue;
      const v = String(o.value);
      if (v === otherValue) continue;
      if (!map.has(v)) map.set(v, { value: v, label: o.label || v });
    }
    const list = [...map.values()];
    if (allowOther) list.push({ value: otherValue, label: resolvedOtherLabel });
    return list;
  }, [options, extraOptions, allowOther, otherValue, resolvedOtherLabel]);

  const valueInOptions = mergedOptions.some(
    (o) => o.value !== otherValue && o.value === String(value ?? ""),
  );
  const [otherMode, setOtherMode] = useState(() =>
    Boolean(allowOther && value && !valueInOptions),
  );
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (allowOther && value && !mergedOptions.some((o) => o.value !== otherValue && o.value === String(value))) {
      setOtherMode(true);
    } else if (valueInOptions) {
      setOtherMode(false);
    }
  }, [value, allowOther, mergedOptions, otherValue, valueInOptions]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = String(query || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (!q) return mergedOptions;
    return mergedOptions.filter((o) => {
      const hay = `${o.label} ${o.value}`.toLowerCase();
      return hay.includes(q) || (o.value === otherValue && resolvedOtherLabel.includes(query.trim()));
    });
  }, [mergedOptions, query, otherValue, resolvedOtherLabel]);

  const displayLabel = otherMode
    ? resolvedOtherLabel
    : mergedOptions.find((o) => o.value === String(value ?? ""))?.label || "";

  const pick = (opt) => {
    if (opt.value === otherValue) {
      setOtherMode(true);
      onChange?.("");
      setQuery("");
      setOpen(false);
      return;
    }
    setOtherMode(false);
    onChange?.(opt.value);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min((i < 0 ? -1 : i) + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0 && filtered[activeIndex]) {
      e.preventDefault();
      pick(filtered[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className={["oh-legacy-smart", "oh-legacy-smart--select", className].filter(Boolean).join(" ")}
      data-testid="legacy-searchable-select"
    >
      <div className="oh-legacy-smart__combo">
        <input
          id={inputId}
          className={["oh-legacy-smart__input", inputClassName].filter(Boolean).join(" ")}
          type="text"
          dir={dir}
          required={required && !otherMode && !value}
          disabled={disabled}
          placeholder={resolvedPlaceholder}
          value={open ? query : displayLabel || (otherMode ? resolvedOtherLabel : "")}
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          role="combobox"
          autoComplete="off"
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={onKeyDown}
        />
        <input type="hidden" value={otherMode ? value || "" : value || ""} required={required} readOnly tabIndex={-1} />
      </div>
      {open ? (
        <ul id={listId} className="oh-legacy-smart__list" role="listbox" dir={dir}>
          {filtered.length === 0 ? (
            <li className="oh-legacy-smart__empty" role="presentation">
              {t("legacy.common.noResults")}
            </li>
          ) : (
            filtered.map((o, idx) => (
              <li
                key={`${o.value}-${idx}`}
                role="option"
                aria-selected={idx === activeIndex || o.value === value}
                className={[
                  "oh-legacy-smart__option",
                  idx === activeIndex ? "oh-legacy-smart__option--active" : "",
                  o.value === value ? "oh-legacy-smart__option--selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                {o.label}
              </li>
            ))
          )}
        </ul>
      ) : null}
      {otherMode ? (
        <label className="oh-legacy-smart__other">
          <span className="oh-legacy-smart__other-label">{resolvedOtherInputLabel}</span>
          <input
            className={["oh-legacy-smart__input", inputClassName].filter(Boolean).join(" ")}
            type="text"
            dir={dir}
            required={required}
            disabled={disabled}
            value={value ?? ""}
            data-testid="legacy-select-other-input"
            onChange={(e) => onChange?.(e.target.value)}
          />
        </label>
      ) : null}
    </div>
  );
}
