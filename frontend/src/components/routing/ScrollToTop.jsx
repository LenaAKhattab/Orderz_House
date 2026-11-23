import { useEffect } from "react";
import { useLocation } from "react-router-dom";

function scrollWindowToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

/**
 * Resets window scroll on route changes (SPAs keep scroll position by default).
 */
export default function ScrollToTop() {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      // A fragment is not always an element anchor (e.g. "#t=<token>" on /claim-order): an invalid
      // selector or malformed escape must never throw and blank the page.
      let target = null;
      try {
        const id = decodeURIComponent(hash.replace(/^#/, ""));
        target = document.getElementById(id) || document.querySelector(hash);
      } catch {
        target = null;
      }
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }

    scrollWindowToTop();
    const frame = requestAnimationFrame(scrollWindowToTop);
    return () => cancelAnimationFrame(frame);
  }, [pathname, search, hash]);

  return null;
}
