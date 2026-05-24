import { useEffect, useRef, useState } from "react";

function CategoryIconArt({ index }) {
  const mod = index % 3;
  if (mod === 0) {
    return (
      <svg viewBox="0 0 40 40" fill="none" className="services-cat-icon__svg" aria-hidden>
        <rect x="6" y="8" width="28" height="24" rx="4" stroke="currentColor" strokeWidth="1.6" />
        <path d="M6 16h28" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  if (mod === 1) {
    return (
      <svg viewBox="0 0 40 40" fill="none" className="services-cat-icon__svg" aria-hidden>
        <path d="M8 30l8-18 6 12 6-8 4 14H8z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" fill="none" className="services-cat-icon__svg" aria-hidden>
      <circle cx="20" cy="14" r="6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 32c0-6 5-10 10-10s10 4 10 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ExploreArrow() {
  return (
    <span className="services-ref-card__cta-arrow" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="m11 6-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default function ServicesRefCard({ cat, idx, tone, isOpen, onToggle, imageSrc }) {
  const title = cat.name || cat.title || "—";
  const id = String(cat.id);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const imgRef = useRef(null);
  const hasImage = Boolean(imageSrc) && !imageFailed;
  const eager = idx < 3;

  useEffect(() => {
    setImageLoaded(false);
    setImageFailed(false);
    const el = imgRef.current;
    if (!el?.complete || el.naturalWidth <= 0) return;

    if (typeof el.decode === "function") {
      el.decode()
        .then(() => setImageLoaded(true))
        .catch(() => setImageLoaded(true));
      return;
    }
    setImageLoaded(true);
  }, [imageSrc]);

  return (
    <button
      type="button"
      aria-expanded={isOpen}
      aria-controls="services-category-detail"
      id={`services-cat-trigger-${id}`}
      className={`services-ref-card services-ref-card--tone-${tone}${hasImage ? " services-ref-card--has-media" : ""}${hasImage && imageLoaded ? " services-ref-card--media-loaded" : ""}${isOpen ? " services-ref-card--active" : ""}`.trim()}
      onClick={onToggle}
    >
      {hasImage ? (
        <span
          className={`services-ref-card__media${imageLoaded ? " services-ref-card__media--loaded" : ""}`}
          aria-hidden
        >
          <span className="services-ref-card__media-skeleton" aria-hidden />
          <img
            ref={imgRef}
            src={imageSrc}
            alt={title}
            className={`services-ref-card__bg-img${imageLoaded ? " services-ref-card__bg-img--loaded" : ""}`}
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : "auto"}
            decoding="async"
            onLoad={() => {
              const el = imgRef.current;
              if (!el) {
                setImageLoaded(true);
                return;
              }
              if (typeof el.decode === "function") {
                el.decode()
                  .then(() => setImageLoaded(true))
                  .catch(() => setImageLoaded(true));
                return;
              }
              setImageLoaded(true);
            }}
            onError={() => setImageFailed(true)}
          />
        </span>
      ) : null}
      <span className="services-ref-card__overlay" aria-hidden />
      <span className="services-ref-card__badge" aria-hidden>
        <CategoryIconArt index={idx} />
      </span>
      <span className="services-ref-card__body">
        <span className="services-ref-card__title">{title}</span>
        {cat.description ? <span className="services-ref-card__desc">{cat.description}</span> : null}
      </span>
      <span className="services-ref-card__cta">
        <span>استكشف الخدمة</span>
        <ExploreArrow />
      </span>
    </button>
  );
}
