import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { postPublicAdClickRequest, postPublicAdImpressionRequest } from "../../services/adsService";
import { usePublicHomeStickyAds } from "../../hooks/usePublicHomeStickyAds";
import HomePromoAdDetailModal from "./HomePromoAdDetailModal";
import HomePromoOffersCarousel from "./HomePromoOffersCarousel";
import HomePromoOfferCard from "./HomePromoOfferCard";
import HomeStickyAdsDock from "./HomeStickyAdsDock";
import { getOrderedHomeOffersAds } from "./homeOffersTheme";
import "./home-promo-offers.css";

const INITIAL_VISIBLE = 6;

function SparkleIcon() {
  return (
    <svg className="home-promo-offers__sparkle" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 1.5l2.35 6.95L22 11l-7.65 2.55L12 21l-2.35-7.45L2 11l7.65-2.55L12 1.5z" />
    </svg>
  );
}

/**
 * Full-width homepage band: static grid (1 ad) or Embla carousel (2+ ads).
 * Desktop: optional fixed vertical dock after scrolling past this band until partners.
 * @param {{ ads: import("../../types/ad.js").Ad[]; placement?: string; showTitle?: boolean; variant?: "default"|"hero" }} p
 */
export default function HomePromoOffersSection({
  ads = [],
  placement = "home_right_panel",
  showTitle = true,
  variant = "default",
}) {
  const tracked = useRef(new Set());
  const triggerRef = useRef(/** @type {HTMLElement | null} */ (null));
  const sectionRef = useRef(/** @type {HTMLElement | null} */ (null));
  const [expanded, setExpanded] = useState(false);
  const [detailAd, setDetailAd] = useState(/** @type {import("../../types/ad.js").Ad | null} */ (null));

  const ordered = useMemo(() => getOrderedHomeOffersAds(ads), [ads]);
  const useCarousel = ordered.length > 1;
  const hasOverflow = ordered.length > INITIAL_VISIBLE;
  const displayAds = useMemo(() => {
    if (useCarousel) return ordered;
    return expanded || !hasOverflow ? ordered : ordered.slice(0, INITIAL_VISIBLE);
  }, [ordered, useCarousel, expanded, hasOverflow]);

  const showMore = !useCarousel && hasOverflow && !expanded;

  const { dockVisible, desktop } = usePublicHomeStickyAds({
    adsSectionRef: sectionRef,
    enabled: ordered.length > 0,
  });

  useEffect(() => {
    if (!ads?.length) return;
    for (const ad of ads) {
      const id = String(ad.id);
      if (tracked.current.has(id)) continue;
      tracked.current.add(id);
      postPublicAdImpressionRequest(id, { placement }).catch(() => {});
    }
  }, [ads, placement]);

  const openDetails = useCallback(
    (ad, triggerEl) => {
      triggerRef.current = triggerEl;
      setDetailAd(ad);
      postPublicAdClickRequest(ad.id, { placement }).catch(() => {});
    },
    [placement]
  );

  const closeModal = useCallback(() => {
    setDetailAd(null);
  }, []);

  const trackClick = useCallback(
    (adId) => {
      postPublicAdClickRequest(adId, { placement }).catch(() => {});
    },
    [placement]
  );

  useEffect(() => {
    if (!detailAd) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [detailAd]);

  useEffect(() => {
    if (detailAd !== null) return;
    const el = triggerRef.current;
    triggerRef.current = null;
    requestAnimationFrame(() => {
      if (el && document.contains(el)) el.focus();
    });
  }, [detailAd]);

  if (!ordered.length) return null;

  const isHero = variant === "hero";
  const sectionClass = `home-promo-offers${isHero ? " home-promo-offers--hero" : ""}`;
  const showHead = showTitle || showMore;

  return (
    <>
      <section
        ref={sectionRef}
        className={sectionClass}
        dir="rtl"
        aria-labelledby={showTitle ? "home-promo-offers-heading" : undefined}
        aria-label={showTitle ? undefined : "عروض وإعلانات"}
      >
        {showHead ? (
          <header className="home-promo-offers__head">
            {showTitle ? (
              <div className="home-promo-offers__title-block">
                <SparkleIcon />
                <h2 id="home-promo-offers-heading" className="home-promo-offers__title">
                  عروض وإعلانات مميزة
                </h2>
              </div>
            ) : null}
            {showMore ? (
              <button type="button" className="home-promo-offers__more-btn" onClick={() => setExpanded(true)}>
                عرض المزيد
              </button>
            ) : null}
          </header>
        ) : null}

        {useCarousel ? (
          <HomePromoOffersCarousel
            ads={displayAds}
            variant={variant}
            openDetails={openDetails}
            onTrackClick={trackClick}
          />
        ) : (
          <div className="home-promo-offers__grid">
            {displayAds.map((ad) => (
              <div key={ad.id} className="home-promo-offers__cell">
                <HomePromoOfferCard ad={ad} onTrackClick={() => trackClick(ad.id)} onOpenDetails={openDetails} />
              </div>
            ))}
          </div>
        )}
      </section>

      {desktop ? (
        <HomeStickyAdsDock
          visible={dockVisible}
          ads={ordered}
          openDetails={openDetails}
          onTrackClick={trackClick}
        />
      ) : null}

      <HomePromoAdDetailModal ad={detailAd} onClose={closeModal} />
    </>
  );
}
