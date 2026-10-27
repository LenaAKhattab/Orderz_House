import { useEffect, useRef } from "react";

/**
 * Calls `onRestore("pageshow")` when the page is restored from the browser back-forward cache — e.g.
 * browser Back from Stripe Checkout — and, with `onVisible`, `onRestore("visible")` when the tab is
 * shown again. A BFCache restore brings back React state as it was before `window.location.href = url`
 * (busy/redirecting flags still on, payment state stale), so callers reset it and refetch here.
 */
export function usePageRestore(onRestore, { enabled = true, onVisible = false } = {}) {
  const callbackRef = useRef(onRestore);
  useEffect(() => {
    callbackRef.current = onRestore;
  });

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;
    const onPageShow = (event) => {
      if (event.persisted) callbackRef.current?.("pageshow");
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") callbackRef.current?.("visible");
    };
    window.addEventListener("pageshow", onPageShow);
    if (onVisible) document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      if (onVisible) document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, onVisible]);
}
