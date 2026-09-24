import { useEffect, useId, useRef, useState } from "react";
import "./legacySmartFields.css";

/**
 * Reusable Legacy smart text field with anonymous suggestion dropdown.
 * Always allows free-form entry; suggestions never force a pick.
 */
export default function LegacySmartTextField({
  id,
  value = "",
  onChange,
  suggestions = [],
  loading = false,
  onQueryChange,
  onFocusFetch,
  required = false,
  disabled = false,
  placeholder = "",
  className = "",
  inputClassName = "",
  emptyText = "لا توجد اقتراحات مطابقة",
  dir = "rtl",
  "aria-label": ariaLabel,
}) {
  const autoId = useId();
  const inputId = id || `legacy-smart-${autoId}`;
  const listId = `${inputId}-list`;
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

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

  const showList = open && (loading || suggestions.length > 0 || (value && !loading));

  const selectSuggestion = (text) => {
    onChange?.(String(text));
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (e) => {
    if (!showList && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      onFocusFetch?.();
      return;
    }
    if (!showList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min((i < 0 ? -1 : i) + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0 && suggestions[activeIndex]) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div
      ref={rootRef}
      className={["oh-legacy-smart", className].filter(Boolean).join(" ")}
      data-testid="legacy-smart-text-field"
    >
      <input
        id={inputId}
        className={["oh-legacy-smart__input", inputClassName].filter(Boolean).join(" ")}
        type="text"
        dir={dir}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        value={value ?? ""}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={showList}
        role="combobox"
        autoComplete="off"
        onFocus={() => {
          setOpen(true);
          onFocusFetch?.();
        }}
        onChange={(e) => {
          const next = e.target.value;
          onChange?.(next);
          onQueryChange?.(next);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onKeyDown={onKeyDown}
      />
      {showList ? (
        <ul id={listId} className="oh-legacy-smart__list" role="listbox" dir={dir}>
          {loading ? (
            <li className="oh-legacy-smart__empty" role="presentation">
              جاري التحميل…
            </li>
          ) : suggestions.length === 0 ? (
            <li className="oh-legacy-smart__empty" role="presentation">
              {emptyText}
            </li>
          ) : (
            suggestions.map((s, idx) => (
              <li
                key={`${s}-${idx}`}
                role="option"
                aria-selected={idx === activeIndex}
                className={[
                  "oh-legacy-smart__option",
                  idx === activeIndex ? "oh-legacy-smart__option--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectSuggestion(s);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                {s}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
