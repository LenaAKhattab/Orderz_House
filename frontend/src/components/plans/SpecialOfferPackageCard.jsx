import { useRef, useState } from "react";
import {
  Briefcase,
  CalendarDays,
  Check,
  Clock3,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import {
  buildSpecialOfferWhatsAppUrl,
  hasSpecialOfferRefundExplanation,
  isSpecialOfferCheckoutSupported,
  SPECIAL_OFFER_PURCHASE_MODE,
} from "../../constants/specialOfferPackage";
import SpecialOfferRefundDetailsModal from "./SpecialOfferRefundDetailsModal";
import "./specialOfferPackageCard.css";

function formatAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function savePercent(priceJod, originalPriceJod) {
  const price = Number(priceJod);
  const original = Number(originalPriceJod);
  if (!(original > price) || !(price >= 0)) return null;
  return Math.max(1, Math.round((1 - price / original) * 100));
}

/**
 * Premium promotional card — matches launch-offer visual (blue hero + white feature panel).
 * Separate from STARTER/SILVER/PRO/ELITE PlanCard.
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
  const [refundOpen, setRefundOpen] = useState(false);
  const refundTriggerRef = useRef(null);

  if (!offer) return null;

  const showRefundDetails = hasSpecialOfferRefundExplanation(offer);

  const checkoutSupported = isSpecialOfferCheckoutSupported(offer);
  const purchaseMode = checkoutSupported
    ? SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT
    : SPECIAL_OFFER_PURCHASE_MODE.WHATSAPP;

  const defaultCta =
    purchaseMode === SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT
      ? t?.("plans.specialOffer.cta") || "احصل على العرض الآن"
      : t?.("plans.specialOffer.ctaWhatsapp") || "تواصل للحصول على العرض";
  const ctaLabel = offer.ctaLabel || defaultCta;
  const jod = t?.("plans.currency.jod") || "د.أ";

  const hasOriginal =
    offer.originalPriceJod != null &&
    Number(offer.originalPriceJod) > Number(offer.priceJod);
  const discount = hasOriginal ? savePercent(offer.priceJod, offer.originalPriceJod) : null;

  const features = [
    {
      key: "offers",
      label: t?.("plans.specialOffer.totalOffers") || "عدد العروض",
      value: `${formatAmount(offer.totalOffers)} ${t?.("plans.specialOffer.available") || "متاح"}`,
      Icon: Target,
    },
    {
      key: "daily",
      label: t?.("plans.specialOffer.dailyLimit") || "حد يومي",
      value: `${formatAmount(offer.dailyLimit)} ${t?.("plans.specialOffer.offersPerDay") || "عرض يومياً"}`,
      Icon: CalendarDays,
    },
    offer.maxProjectValueJod != null
      ? {
          key: "max",
          label: t?.("plans.specialOffer.maxProject") || "الحد الأقصى للمشروع",
          value: `${t?.("plans.specialOffer.upTo") || "حتى"} ${formatAmount(offer.maxProjectValueJod)} ${jod} ${t?.("plans.specialOffer.perProject") || "للمشروع"}`,
          Icon: Briefcase,
        }
      : {
          key: "max",
          label: t?.("plans.specialOffer.maxProject") || "الحد الأقصى للمشروع",
          value: t?.("plans.specialOffer.unlimitedProjects") || "بلا سقف للمشاريع",
          Icon: Briefcase,
        },
    {
      key: "duration",
      label: t?.("plans.specialOffer.durationShort") || "المدة",
      value: `${offer.durationDays} ${t?.("plans.specialOffer.days") || "يوم"}`,
      Icon: Clock3,
    },
  ];

  const handleCheckoutClick = (e) => {
    e.preventDefault();
    if (preview || checkoutBusy) return;
    onCheckout?.(offer);
  };

  const ctaContent = (
    <>
      <span>{checkoutBusy ? t?.("plans.specialOffer.checkoutBusy") || "جاري التحويل للدفع…" : ctaLabel}</span>
      {!checkoutBusy ? <Sparkles className="oh-special-offer-card__cta-icon" aria-hidden size={16} strokeWidth={2.25} /> : null}
    </>
  );

  const handleRefundClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setRefundOpen(true);
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
        <span>{offer.badgeText || "عرض خاص"}</span>
      </div>

      <div className="oh-special-offer-card__hero">
        <div className="oh-special-offer-card__limited">
          {offer.ribbonText || "لفترة محدودة"}
        </div>

        <header className="oh-special-offer-card__head">
          <h2 className="oh-special-offer-card__title">{offer.title}</h2>
          {offer.subtitle ? <p className="oh-special-offer-card__subtitle">{offer.subtitle}</p> : null}
        </header>

        <div className="oh-special-offer-card__price">
          <div className="oh-special-offer-card__price-main">
            <span className="oh-special-offer-card__price-amount">{formatAmount(offer.priceJod)}</span>
            <span className="oh-special-offer-card__price-unit">{jod}</span>
          </div>
          {hasOriginal ? (
            <div className="oh-special-offer-card__price-meta">
              <span className="oh-special-offer-card__price-original">
                {formatAmount(offer.originalPriceJod)} {jod}
              </span>
              {discount != null ? (
                <span className="oh-special-offer-card__save">
                  {t?.("plans.specialOffer.savePercent", { percent: discount }) || `وفر ${discount}%`}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="oh-special-offer-card__panel">
        <ul className="oh-special-offer-card__features">
          {features.map((row) => {
            const Icon = row.Icon;
            return (
              <li key={row.key} className="oh-special-offer-card__feature">
                <span className="oh-special-offer-card__feature-end">
                  <span className="oh-special-offer-card__feature-icon" aria-hidden="true">
                    <Icon size={16} strokeWidth={2.1} />
                  </span>
                  <span className="oh-special-offer-card__feature-label">{row.label}</span>
                </span>
                <span className="oh-special-offer-card__feature-value">{row.value}</span>
              </li>
            );
          })}
        </ul>

        <div className="oh-special-offer-card__cta-wrap">
          {preview ? (
            <span className="oh-special-offer-card__cta oh-special-offer-card__cta--disabled">{ctaContent}</span>
          ) : purchaseMode === SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT ? (
            <button
              type="button"
              className="oh-special-offer-card__cta"
              disabled={checkoutBusy}
              onClick={handleCheckoutClick}
              data-special-offer-cta="checkout"
            >
              {ctaContent}
            </button>
          ) : (
            <a
              className="oh-special-offer-card__cta"
              href={buildSpecialOfferWhatsAppUrl(offer)}
              target="_blank"
              rel="noopener noreferrer"
              data-special-offer-cta="whatsapp"
            >
              {ctaContent}
            </a>
          )}
          {offer.microcopy ? (
            <p className="oh-special-offer-card__microcopy">
              <Check className="oh-special-offer-card__microcopy-icon" aria-hidden size={14} strokeWidth={2.5} />
              <span>{offer.microcopy}</span>
            </p>
          ) : null}
          {showRefundDetails ? (
            <button
              type="button"
              ref={refundTriggerRef}
              className="oh-special-offer-card__refund-link"
              onClick={handleRefundClick}
              data-special-offer-refund-details="true"
            >
              <ShieldCheck size={13} strokeWidth={2.1} aria-hidden />
              <span>{t?.("plans.specialOffer.refundDetailsLink") || "تفاصيل استرداد مبلغ الباقة"}</span>
            </button>
          ) : null}
        </div>
      </div>

      <SpecialOfferRefundDetailsModal
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        offer={offer}
        t={t}
        triggerRef={refundTriggerRef}
      />
    </article>
  );
}
