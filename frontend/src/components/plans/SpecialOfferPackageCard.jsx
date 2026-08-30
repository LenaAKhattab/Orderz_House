import { ApproximateCurrencyLine } from "../money/JodMoneyDisplay";
import {
  buildSpecialOfferWhatsAppUrl,
  isSpecialOfferCheckoutSupported,
  SPECIAL_OFFER_PURCHASE_MODE,
} from "../../constants/specialOfferPackage";
import "./specialOfferPackageCard.css";

function formatAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/**
 * Premium promotional card — separate from STARTER/SILVER/PRO/ELITE PlanCard.
 * Checkout mode uses onCheckout → existing marketplace membership Stripe flow.
 * WhatsApp mode is manual lead only.
 */
export default function SpecialOfferPackageCard({
  offer,
  t,
  compact = false,
  preview = false,
  checkoutBusy = false,
  onCheckout = null,
  className = "",
}) {
  if (!offer) return null;

  const checkoutSupported = isSpecialOfferCheckoutSupported(offer);
  const purchaseMode = checkoutSupported
    ? SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT
    : SPECIAL_OFFER_PURCHASE_MODE.WHATSAPP;

  const defaultCta =
    purchaseMode === SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT
      ? t?.("plans.specialOffer.cta") || "احصل على العرض الآن"
      : t?.("plans.specialOffer.ctaWhatsapp") || "تواصل للحصول على العرض";
  const ctaLabel = offer.ctaLabel || defaultCta;

  const hasOriginal =
    offer.originalPriceJod != null &&
    Number(offer.originalPriceJod) > Number(offer.priceJod);

  const features = [
    {
      key: "offers",
      label: t?.("plans.specialOffer.totalOffers") || "عدد العروض",
      value: offer.totalOffers,
    },
    {
      key: "daily",
      label: t?.("plans.specialOffer.dailyLimit") || "الحد اليومي",
      value: offer.dailyLimit,
    },
    offer.maxProjectValueJod != null
      ? {
          key: "max",
          label: t?.("plans.specialOffer.maxProject") || "الحد الأقصى للمشروع",
          value: `${formatAmount(offer.maxProjectValueJod)} ${t?.("plans.currency.jod") || "د.أ"}`,
        }
      : null,
    {
      key: "duration",
      label: t?.("plans.specialOffer.duration") || "مدة الباقة",
      value: `${offer.durationDays} ${t?.("plans.specialOffer.days") || "يوم"}`,
    },
  ].filter(Boolean);

  const handleCheckoutClick = (e) => {
    e.preventDefault();
    if (preview || checkoutBusy) return;
    onCheckout?.(offer);
  };

  return (
    <article
      className={[
        "oh-special-offer-card",
        compact ? "oh-special-offer-card--compact" : "",
        preview ? "oh-special-offer-card--preview" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-special-offer-card="true"
      data-purchase-mode={purchaseMode}
      aria-label={offer.title}
    >
      <div className="oh-special-offer-card__ribbon" aria-hidden="true">
        {offer.ribbonText || "لفترة محدودة"}
      </div>

      <div className="oh-special-offer-card__badge">{offer.badgeText || "عرض خاص"}</div>

      <header className="oh-special-offer-card__head">
        <h2 className="oh-special-offer-card__title">{offer.title}</h2>
        {offer.subtitle ? <p className="oh-special-offer-card__subtitle">{offer.subtitle}</p> : null}
      </header>

      <div className="oh-special-offer-card__price">
        {hasOriginal ? (
          <span className="oh-special-offer-card__price-original">
            {formatAmount(offer.originalPriceJod)}
          </span>
        ) : null}
        <span className="oh-special-offer-card__price-amount">{formatAmount(offer.priceJod)}</span>
        <span className="oh-special-offer-card__price-unit">{t?.("plans.currency.jod") || "د.أ"}</span>
        <ApproximateCurrencyLine amount={offer.priceJod} />
      </div>

      <ul className="oh-special-offer-card__features">
        {features.map((row) => (
          <li key={row.key} className="oh-special-offer-card__feature">
            <span className="oh-special-offer-card__feature-label">{row.label}</span>
            <span className="oh-special-offer-card__feature-value">{row.value}</span>
          </li>
        ))}
      </ul>

      <div className="oh-special-offer-card__cta-wrap">
        {preview ? (
          <span className="oh-special-offer-card__cta oh-special-offer-card__cta--disabled">{ctaLabel}</span>
        ) : purchaseMode === SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT ? (
          <button
            type="button"
            className="oh-special-offer-card__cta"
            disabled={checkoutBusy}
            onClick={handleCheckoutClick}
            data-special-offer-cta="checkout"
          >
            {checkoutBusy
              ? t?.("plans.specialOffer.checkoutBusy") || "جاري التحويل للدفع…"
              : ctaLabel}
          </button>
        ) : (
          <a
            className="oh-special-offer-card__cta"
            href={buildSpecialOfferWhatsAppUrl(offer)}
            target="_blank"
            rel="noopener noreferrer"
            data-special-offer-cta="whatsapp"
          >
            {ctaLabel}
          </a>
        )}
        {offer.microcopy ? (
          <p className="oh-special-offer-card__microcopy">{offer.microcopy}</p>
        ) : null}
      </div>
    </article>
  );
}
