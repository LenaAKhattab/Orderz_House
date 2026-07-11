import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Compact row actions menu for financial center tables.
 * @param {{ label: string; items: Array<{ key?: string; label: string; onClick?: () => void; disabled?: boolean; hidden?: boolean }> }} p
 */
export default function FinancialCenterRowActions({ label, items }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, minWidth: 148 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  const visibleItems = items.filter((item) => !item.hidden);

  useEffect(() => {
    if (!open) return undefined;

    const close = () => setOpen(false);

    const onDocPointer = (e) => {
      if (triggerRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      close();
    };

    const onKey = (e) => {
      if (e.key === "Escape") close();
    };

    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!visibleItems.length) return;

    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const minWidth = Math.max(148, Math.round(rect.width));
      let left = rect.left;
      const maxLeft = window.innerWidth - minWidth - 8;
      if (left > maxLeft) left = maxLeft;
      if (left < 8) left = 8;

      const estHeight = visibleItems.length * 34 + 10;
      let top = rect.bottom + 4;
      if (top + estHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - estHeight - 4);
      }

      setPos({ top, left, minWidth });
    }

    setOpen((v) => !v);
  };

  if (!visibleItems.length) {
    return <span className="fc-row-actions__empty">—</span>;
  }

  return (
    <div className="fc-row-actions">
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-secondary btn-sm fc-row-actions__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={toggle}
      >
        <span className="fc-row-actions__label">{label}</span>
        <span className="fc-row-actions__chev" aria-hidden>
          ▾
        </span>
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="fc-row-actions__menu"
              role="menu"
              style={{ top: `${pos.top}px`, left: `${pos.left}px`, minWidth: `${pos.minWidth}px` }}
            >
              {visibleItems.map((item, index) => (
                <button
                  key={item.key || `${item.label}-${index}`}
                  type="button"
                  role="menuitem"
                  className="fc-row-actions__item"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onClick?.();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
