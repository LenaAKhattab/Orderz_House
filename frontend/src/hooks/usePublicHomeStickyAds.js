import { useCallback, useEffect, useRef, useState } from "react";

/** Intersection target: partners logos row (below title — avoids hiding while FAQ/categories still on screen). */
const PARTNERS_ANCHOR_ID = "home-partners-anchor";
const DESKTOP_MQ = "(min-width: 1024px)";

/**
 * Desktop-only: show a fixed ads dock after the homepage promo band scrolls out,
 * until the partners logos row enters the viewport (with a tightened root).
 * @param {{ adsSectionRef: React.RefObject<HTMLElement | null>; enabled?: boolean }} p
 */
export function usePublicHomeStickyAds({ adsSectionRef, enabled = true }) {
  const [dockVisible, setDockVisible] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const pastAdsRef = useRef(false);
  const partnersHitRef = useRef(false);

  const sync = useCallback(() => {
    setDockVisible(Boolean(desktop && pastAdsRef.current && !partnersHitRef.current));
  }, [desktop]);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    const onChange = () => setDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!desktop || !enabled) {
      pastAdsRef.current = false;
      partnersHitRef.current = false;
      const id = requestAnimationFrame(() => {
        setDockVisible(false);
      });
      return () => cancelAnimationFrame(id);
    }

    const adsEl = adsSectionRef?.current;
    const partnersAnchor = document.getElementById(PARTNERS_ANCHOR_ID);
    if (!adsEl || !partnersAnchor) {
      const id = requestAnimationFrame(() => {
        setDockVisible(false);
      });
      return () => cancelAnimationFrame(id);
    }

    /** Entire promo band is above the viewport (user scrolled down past it). */
    const setPastFromAdsRect = (rect) => {
      if (!rect.height) {
        pastAdsRef.current = false;
        return;
      }
      pastAdsRef.current = rect.bottom < 0;
    };

    const onAds = (entries) => {
      const e = entries[0];
      if (!e) return;
      setPastFromAdsRect(e.boundingClientRect);
      sync();
    };

    const onPartners = (entries) => {
      const e = entries[0];
      partnersHitRef.current = Boolean(e?.isIntersecting);
      sync();
    };

    const ioAds = new IntersectionObserver(onAds, { threshold: [0, 0.01, 0.05, 0.1, 1] });
    const ioPartners = new IntersectionObserver(onPartners, {
      threshold: 0,
      // Shrink root from bottom so "intersecting" means logos are well into view, not a sliver at the fold.
      rootMargin: "0px 0px -22% 0px",
    });

    ioAds.observe(adsEl);
    ioPartners.observe(partnersAnchor);

    const bootId = requestAnimationFrame(() => {
      setPastFromAdsRect(adsEl.getBoundingClientRect());
      partnersHitRef.current = false;
      sync();
    });

    return () => {
      cancelAnimationFrame(bootId);
      ioAds.disconnect();
      ioPartners.disconnect();
    };
  }, [desktop, enabled, adsSectionRef, sync]);

  return { dockVisible, desktop };
}
