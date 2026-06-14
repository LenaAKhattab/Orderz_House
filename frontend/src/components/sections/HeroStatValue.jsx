import { useEffect, useRef, useState } from "react";
import { formatHomePublicStat } from "../../hooks/usePublicHomeStats";
import { getAnalyticsRawNumber, isAnalyticsMetricLoading, resolveNumber } from "./heroHomeStatUtils";

const COUNT_UP_MS = 420;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return reduced;
}

function useAnimatedCount(target) {
  const prefersReduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(target);
  const prevTargetRef = useRef(target);
  const frameRef = useRef(null);

  useEffect(() => {
    if (target == null) return undefined;

    if (prefersReduced) {
      prevTargetRef.current = target;
      setDisplay(target);
      return undefined;
    }

    const from = prevTargetRef.current ?? target;
    prevTargetRef.current = target;

    if (from === target) {
      setDisplay(target);
      return undefined;
    }

    if (target < from) {
      setDisplay(target);
      return undefined;
    }

    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / COUNT_UP_MS);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(Math.round(from + (target - from) * eased));
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target, prefersReduced]);

  return display;
}

/**
 * Hero stat number — skeleton on first load, last value on refresh, subtle count-up on change.
 * @param {{ statsPayload: object | null, metricKey: 'views' | 'active' | 'availableOrders' | 'completedOrders', className?: string }} p
 */
export default function HeroStatValue({ statsPayload, metricKey, className = "" }) {
  const loading = isAnalyticsMetricLoading(statsPayload, metricKey);
  const raw = getAnalyticsRawNumber(statsPayload, metricKey);
  const formatted = resolveNumber(statsPayload, metricKey);
  const animated = useAnimatedCount(raw);
  const displayText =
    animated != null && !Number.isNaN(Number(animated)) ? formatHomePublicStat(animated) : formatted;

  if (loading) {
    return (
      <span
        className={`home-hero-stat-value home-hero-stat-value--loading ${className}`.trim()}
        aria-busy="true"
        aria-label="جاري تحميل الإحصائية"
      >
        <span className="home-hero-stat-value__skeleton" aria-hidden="true" />
      </span>
    );
  }

  return (
    <span
      className={`home-hero-stat-value home-hero-stat-value--ready ${className}`.trim()}
      aria-live="polite"
    >
      {displayText || "—"}
    </span>
  );
}
