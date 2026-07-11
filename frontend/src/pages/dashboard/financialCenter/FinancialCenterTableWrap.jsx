import { useCallback, useEffect, useRef, useState } from "react";

function getScrollState(el) {
  const max = Math.max(0, el.scrollWidth - el.clientWidth);
  if (max <= 1) return { start: false, end: false };
  const pos = Math.abs(el.scrollLeft);
  return {
    start: pos > 4,
    end: pos < max - 4,
  };
}

export default function FinancialCenterTableWrap({ children, className = "" }) {
  const ref = useRef(null);
  const [scrollState, setScrollState] = useState({ start: false, end: false });

  const refresh = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setScrollState(getScrollState(el));
  }, []);

  useEffect(() => {
    refresh();
    const el = ref.current;
    if (!el) return undefined;
    el.addEventListener("scroll", refresh, { passive: true });
    const ro = new ResizeObserver(refresh);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", refresh);
      ro.disconnect();
    };
  }, [refresh, children]);

  const cls = [
    "fc-table-wrap",
    scrollState.start ? "fc-table-wrap--scroll-start" : "",
    scrollState.end ? "fc-table-wrap--scroll-end" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={ref} className={cls}>
      {children}
    </div>
  );
}
