import { useEffect, useRef } from "react";
import SafeAdImage from "./SafeAdImage";
import { isExternalUrl, linkTargetRel } from "./adUtils";
import { postPublicPopupAdClickRequest } from "../../services/api";
import { useTranslation } from "../../i18n/LanguageProvider";
import "./popupAdModal.css";

function pickLocalized({ locale, ar, en }) {
  const isEn = locale === "en";
  return (isEn ? en : ar) || ar || en || "";
}

/**
 * @param {{
 *   ad: import("../../types/popupAd.js").PopupAd | null;
 *   onClose: () => void;
 * }} p
 */
export default function PopupAdModal({ ad, onClose }) {
  const ref = useRef(null);
  const syncingRef = useRef(false);
  const { locale } = useTranslation();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (ad) {
      if (!d.open) d.showModal();
      requestAnimationFrame(() => {
        d.querySelector("[data-popup-ad-close]")?.focus();
      });
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
    if (d.open) {
      syncingRef.current = true;
      d.close();
      syncingRef.current = false;
    }
    return undefined;
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

  if (!ad) {
    return null;
  }

  const title = pickLocalized({ locale, ar: ad.titleAr, en: ad.titleEn });
  const body = pickLocalized({ locale, ar: ad.bodyAr, en: ad.bodyEn });
  const href = ad.ctaUrl && String(ad.ctaUrl).trim() ? String(ad.ctaUrl).trim() : null;
  const ctaText = pickLocalized({ locale, ar: ad.ctaText, en: ad.ctaTextEn }) || ad.ctaText?.trim() || "";
  const linkProps = href
    ? linkTargetRel({ openInNewTab: ad.openInNewTab }, href)
    : { target: "_self", rel: undefined };

  const onCtaClick = () => {
    const id = Number(ad.id);
    if (!Number.isFinite(id) || id <= 0) return;
    postPublicPopupAdClickRequest(id).catch(() => {});
  };

  return (
    <dialog
      ref={ref}
      className="oh-popup-ad-modal"
      dir="rtl"
      aria-modal="true"
      aria-labelledby="oh-popup-ad-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) ref.current?.close();
      }}
    >
      <div className="oh-popup-ad-modal__panel" onClick={(e) => e.stopPropagation()}>
        <header className="oh-popup-ad-modal__header">
          <h2 id="oh-popup-ad-modal-title" className="oh-popup-ad-modal__title">
            {title}
          </h2>
          <button
            type="button"
            data-popup-ad-close
            className="oh-popup-ad-modal__close"
            onClick={() => ref.current?.close()}
            aria-label="إغلاق الإعلان"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="oh-popup-ad-modal__body">
          {ad.imageUrl ? (
            <div className="oh-popup-ad-modal__media">
              <SafeAdImage
                src={ad.imageUrl}
                alt={title}
                className="oh-popup-ad-modal__media-inner"
                imgClassName="oh-popup-ad-modal__img"
              />
            </div>
          ) : null}

          {body ? <p className="oh-popup-ad-modal__desc">{body}</p> : null}

          {href && ctaText ? (
            <div className="oh-popup-ad-modal__actions">
              <a
                href={href}
                {...linkProps}
                className="oh-popup-ad-modal__cta btn btn-primary"
                onClick={onCtaClick}
                {...(isExternalUrl(href) ? { dir: "ltr" } : {})}
              >
                {ctaText}
              </a>
            </div>
          ) : ctaText ? (
            <div className="oh-popup-ad-modal__actions">
              <button
                type="button"
                className="oh-popup-ad-modal__cta btn btn-primary"
                onClick={() => ref.current?.close()}
              >
                {ctaText}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
