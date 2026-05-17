import Autoplay from "embla-carousel-autoplay";
import useEmblaCarousel from "embla-carousel-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import HomePromoOfferCard from "./HomePromoOfferCard";
import "./home-promo-offers-carousel.css";

function ChevronIcon({ flipped = false }) {
  return (
    <svg
      className={`home-promo-offers__carousel-chevron${flipped ? " home-promo-offers__carousel-chevron--flip" : ""}`}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

/**
 * RTL horizontal carousel for homepage promo ads (Embla + autoplay).
 * @param {{
 *   ads: import("../../types/ad.js").Ad[];
 *   variant?: "default"|"hero";
 *   openDetails: (ad: import("../../types/ad.js").Ad, el: HTMLElement) => void;
 *   onTrackClick: (adId: string) => void;
 * }} p
 */
export default function HomePromoOffersCarousel({ ads, variant = "default", openDetails, onTrackClick }) {
  const isHero = variant === "hero";
  const multi = ads.length > 1;

  const plugins = useMemo(
    () =>
      multi
        ? [
            Autoplay({
              delay: 5000,
              stopOnMouseEnter: true,
              stopOnInteraction: false,
              playOnInit: true,
              stopOnFocusIn: true,
              rootNode: (emblaRoot) => emblaRoot.closest(".home-promo-offers__carousel") ?? emblaRoot,
            }),
          ]
        : [],
    [multi],
  );

  const emblaOptions = useMemo(
    () => ({
      loop: multi,
      direction: "rtl",
      align: "start",
      slidesToScroll: 1,
      duration: 32,
      dragFree: false,
      watchDrag: true,
    }),
    [multi],
  );

  const [emblaRef, emblaApi] = useEmblaCarousel(emblaOptions, plugins);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [snapCount, setSnapCount] = useState(0);

  const onSelect = useCallback((api) => {
    setSelectedIndex(api.selectedScrollSnap());
    setSnapCount(api.scrollSnapList().length);
  }, []);

  useEffect(() => {
    if (!emblaApi) return undefined;
    onSelect(emblaApi);
    emblaApi.on("reInit", onSelect);
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("reInit", onSelect);
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onSelect]);

  const scrollPrev = useCallback(() => {
    emblaApi?.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    emblaApi?.scrollNext();
  }, [emblaApi]);

  const scrollTo = useCallback(
    (index) => {
      emblaApi?.scrollTo(index);
    },
    [emblaApi],
  );

  const adsKey = useMemo(() => ads.map((a) => a.id).join(","), [ads]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.reInit();
  }, [emblaApi, adsKey]);

  const rootClass = [
    "home-promo-offers__carousel",
    isHero ? "home-promo-offers__carousel--hero" : "",
    multi && ads.length <= 3 && !isHero ? "home-promo-offers__carousel--focus-one" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rootClass}
      role="region"
      aria-roledescription="عرض دوّار"
      aria-label={isHero ? "إعلانات مميزة — عرض دوّار" : "عروض وإعلانات مميزة — عرض دوّار"}
    >
      <div className="home-promo-offers__carousel-stage">
        {multi ? (
          <button
            type="button"
            className="home-promo-offers__carousel-arrow home-promo-offers__carousel-arrow--prev"
            onClick={scrollPrev}
            aria-label="الإعلان السابق"
          >
            <ChevronIcon />
          </button>
        ) : null}

        <div className="home-promo-offers__carousel-viewport-wrap">
          <div className="home-promo-offers__carousel-viewport" ref={emblaRef}>
            <div className="home-promo-offers__carousel-container">
              {ads.map((ad, i) => (
                <div
                  className={`home-promo-offers__carousel-slide${i === selectedIndex ? " is-active" : ""}`}
                  key={ad.id}
                >
                  <div className="home-promo-offers__cell home-promo-offers__cell--carousel">
                    <HomePromoOfferCard
                      ad={ad}
                      onTrackClick={() => onTrackClick(ad.id)}
                      onOpenDetails={openDetails}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {multi ? (
          <button
            type="button"
            className="home-promo-offers__carousel-arrow home-promo-offers__carousel-arrow--next"
            onClick={scrollNext}
            aria-label="الإعلان التالي"
          >
            <ChevronIcon flipped />
          </button>
        ) : null}
      </div>

      {multi && snapCount > 1 ? (
        <div className="home-promo-offers__carousel-dots" role="tablist" aria-label="مؤشر الشرائح">
          {Array.from({ length: snapCount }, (_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === selectedIndex}
              aria-label={`الشريحة ${i + 1} من ${snapCount}`}
              className={`home-promo-offers__carousel-dot${i === selectedIndex ? " is-active" : ""}`}
              onClick={() => scrollTo(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
