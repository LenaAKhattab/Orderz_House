import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const PANEL_MAX_HEIGHT = 280;
const PANEL_GAP = 4;

/**
 * Scrollable dropdown — same value/onChange contract as <select>, presentation only.
 */
export default function FinancialCenterScrollSelect({
  value,
  onChange,
  options,
  className = "",
  disabled = false,
  id,
  ariaLabel,
  placeholder = "—",
}) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState(null);
  const wrapRef = useRef(null);
  const panelRef = useRef(null);
  const uid = useId();

  const normalized = useMemo(
    () =>
      (options || []).map((opt) => {
        if (opt != null && typeof opt === "object") {
          return { value: String(opt.value), label: String(opt.label ?? opt.value) };
        }
        return { value: String(opt), label: String(opt) };
      }),
    [options],
  );

  const selected = normalized.find((o) => o.value === String(value)) || null;

  const updatePanelPosition = () => {
    const trigger = wrapRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const isRtl = getComputedStyle(trigger).direction === "rtl";
    const viewportPad = 12;
    const minWidth = Math.max(rect.width, 120);
    const maxWidth = Math.min(window.innerWidth - viewportPad * 2, 280);

    let width = minWidth;
    let left = isRtl ? rect.right - width : rect.left;
    if (left + width > window.innerWidth - viewportPad) {
      left = window.innerWidth - viewportPad - width;
    }
    if (left < viewportPad) {
      left = viewportPad;
      width = Math.min(maxWidth, window.innerWidth - viewportPad * 2);
    }

    const spaceBelow = window.innerHeight - rect.bottom - PANEL_GAP - viewportPad;
    const spaceAbove = rect.top - PANEL_GAP - viewportPad;
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    const available = openUp ? spaceAbove : spaceBelow;
    const maxHeight = Math.min(PANEL_MAX_HEIGHT, Math.max(120, available));

    setPanelStyle({
      position: "fixed",
      zIndex: 1400,
      left: `${left}px`,
      width: `${width}px`,
      maxHeight: `${maxHeight}px`,
      top: openUp ? undefined : `${rect.bottom + PANEL_GAP}px`,
      bottom: openUp ? `${window.innerHeight - rect.top + PANEL_GAP}px` : undefined,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
    const onReflow = () => updatePanelPosition();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !panelRef.current || !selected) return;
    const active = panelRef.current.querySelector(".fc-scroll-select__opt--active");
    active?.scrollIntoView({ block: "nearest" });
  }, [open, selected?.value]);

  useEffect(() => {
    const onDown = (e) => {
      const trigger = wrapRef.current;
      const panel = panelRef.current;
      if (trigger?.contains(e.target) || panel?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("touchstart", onDown, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("touchstart", onDown, true);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const panel =
    open && panelStyle ? (
      <div
        ref={panelRef}
        className="fc-scroll-select__panel"
        style={panelStyle}
        role="listbox"
        aria-activedescendant={selected ? `${uid}-opt-${selected.value}` : undefined}
      >
        {normalized.map((opt) => {
          const isActive = String(value) === opt.value;
          const optId = `${uid}-opt-${opt.value}`;
          return (
            <button
              key={opt.value}
              id={optId}
              type="button"
              role="option"
              aria-selected={isActive}
              className={`fc-scroll-select__opt${isActive ? " fc-scroll-select__opt--active" : ""}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <>
      <div className={`fc-scroll-select ${className}`.trim()} ref={wrapRef}>
        <button
          type="button"
          id={id}
          className={`fc-scroll-select__btn${open ? " fc-scroll-select__btn--open" : ""}`}
          onClick={() => {
            if (disabled) return;
            setOpen((v) => !v);
          }}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
        >
          <span className={`fc-scroll-select__value${selected ? "" : " fc-scroll-select__value--placeholder"}`}>
            {selected ? selected.label : placeholder}
          </span>
          <span className="fc-scroll-select__chev" aria-hidden="true">
            ▾
          </span>
        </button>
      </div>
      {panel ? createPortal(panel, document.body) : null}
    </>
  );
}
