import { useEffect, useRef } from "react";
import SafeAdImage from "./SafeAdImage";
import { linkTargetRel, primaryHref } from "./adUtils";
import { resolvePublicBannerSurface } from "./homeOffersTheme";
import { buildWhatsAppHref, getBannerMetaFromTexts, parseSalePercent } from "./bannerAdMeta";

/**
 * Full-screen dialog overlay for reading a homepage promo ad (RTL).
 * @param {{ ad: import("../../types/ad.js").Ad | null; onClose: () => void }} p
 */
export default function HomePromoAdDetailModal({ ad, onClose }) {
  const ref = useRef(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (ad) {
      if (!d.open) d.showModal();
      requestAnimationFrame(() => {
        d.querySelector("[data-ad-modal-close]")?.focus();
      });
    } else if (d.open) {
      syncingRef.current = true;
      d.close();
      syncingRef.current = false;
    }
  }, [ad]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onDialogClose = () => {
      if (syncingRef.current) return;
      onClose();
    };
    d.addEventListener("close", onDialogClose);
    return () => d.removeEventListener("close", onDialogClose);
  }, [onClose]);

  const surface = ad ? resolvePublicBannerSurface(ad) : null;
  const meta = ad ? getBannerMetaFromTexts(ad.texts) : {};
  const saleN = parseSalePercent(meta?.salePercent);
  const phone = meta?.phone != null ? String(meta.phone).trim() : "";
  const whatsapp = meta?.whatsapp != null ? String(meta.whatsapp).trim() : "";
  const waHref = buildWhatsAppHref(whatsapp);
  const img = ad?.images?.[0];
  const href = ad ? primaryHref(ad) : null;
  const secondaryHref =
    ad?.secondaryCtaUrl && String(ad.secondaryCtaUrl).trim() ? String(ad.secondaryCtaUrl).trim() : null;
  const subtitle = ad?.subtitle?.trim() || "";
  const description = ad?.description?.trim() || "";

  const primaryCta =
    ad &&
    href &&
    ad.ctaText?.trim() && (
      <a
        href={href}
        {...linkTargetRel(ad, href)}
        className="home-promo-ad-modal__cta home-promo-ad-modal__cta--primary"
        style={{ backgroundColor: surface.btnBg, color: surface.btnFg ?? "#fff" }}
      >
        {ad.ctaText.trim()}
      </a>
    );

  const secondaryCta =
    ad &&
    secondaryHref &&
    ad.secondaryCtaText?.trim() && (
      <a
        href={secondaryHref}
        {...linkTargetRel(ad, secondaryHref)}
        className="home-promo-ad-modal__cta home-promo-ad-modal__cta--secondary"
        style={{ borderColor: surface.btnBg, color: surface.btnBg }}
      >
        {ad.secondaryCtaText.trim()}
      </a>
    );

  return (
    <dialog
      ref={ref}
      className="home-promo-ad-modal"
      dir="rtl"
      aria-modal={Boolean(ad)}
      aria-hidden={!ad}
      aria-labelledby={ad ? "home-promo-ad-modal-title" : undefined}
      onClick={(e) => {
        if (e.target === e.currentTarget) ref.current?.close();
      }}
    >
      {ad && surface ? (
        <div className="home-promo-ad-modal__panel" onClick={(e) => e.stopPropagation()}>
          <header className="home-promo-ad-modal__header">
            <h2 id="home-promo-ad-modal-title" className="home-promo-ad-modal__title" style={{ color: surface.titleColor }}>
              {ad.title}
            </h2>
            <button
              type="button"
              data-ad-modal-close
              className="home-promo-ad-modal__close"
              onClick={() => ref.current?.close()}
              aria-label="إغلاق نافذة التفاصيل"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          <div className="home-promo-ad-modal__body">
            {img ? (
              <div className="home-promo-ad-modal__media">
                <SafeAdImage
                  src={img.url}
                  alt={img.alt || ad.title}
                  className="home-promo-ad-modal__media-inner"
                  imgClassName="home-promo-ad-modal__img object-contain"
                />
              </div>
            ) : null}

            {ad.badgeText?.trim() ? (
              <span className="home-promo-ad-modal__badge" style={{ backgroundColor: surface.badgeBg, color: surface.badgeFg }}>
                {ad.badgeText.trim()}
              </span>
            ) : null}

            {subtitle ? (
              <p className="home-promo-ad-modal__subtitle" style={{ color: surface.btnBg }}>
                {subtitle}
              </p>
            ) : null}

            {description ? (
              <p className="home-promo-ad-modal__desc" style={{ color: surface.textColor }}>
                {description}
              </p>
            ) : (
              <p className="home-promo-ad-modal__desc home-promo-ad-modal__desc--muted">لا يوجد وصف إضافي.</p>
            )}

            {saleN != null ? (
              <p className="home-promo-ad-modal__desc" style={{ color: surface.textColor }}>
                <strong>الخصم:</strong> {saleN}%
              </p>
            ) : null}

            {(phone || waHref) && (
              <p className="home-promo-ad-modal__desc" style={{ color: surface.textColor }}>
                {phone ? (
                  <span dir="ltr" style={{ display: "block" }}>
                    هاتف: {phone}
                  </span>
                ) : null}
                {waHref ? (
                  <a href={waHref} target="_blank" rel="noopener noreferrer" dir="ltr" style={{ display: "inline-block", marginTop: 6, fontWeight: 700 }}>
                    واتساب
                  </a>
                ) : null}
              </p>
            )}

            {primaryCta || secondaryCta ? (
              <div className="home-promo-ad-modal__actions">
                {primaryCta}
                {secondaryCta}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
