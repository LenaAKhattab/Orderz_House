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
  localizedSpecialOfferText,
  SPECIAL_OFFER_PURCHASE_MODE,
} from "../../constants/specialOfferPackage";
import SpecialOfferRefundDetailsModal from "./SpecialOfferRefundDetailsModal";
import { useTranslation } from "../../i18n/LanguageProvider";
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
  const { t: tHook, locale } = useTranslation();
  const tr = (key, params) => (t ?? tHook)(key, params);

  if (!offer) return null;

  const showRefundDetails = hasSpecialOfferRefundExplanation(offer);

  const checkoutSupported = isSpecialOfferCheckoutSupported(offer);
  const purchaseMode = checkoutSupported
    ? SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT
    : SPECIAL_OFFER_PURCHASE_MODE.WHATSAPP;

  const defaultCta =
    purchaseMode === SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT
      ? tr("plans.specialOffer.cta")
      : tr("plans.specialOffer.ctaWhatsapp");
  const ctaLabel = localizedSpecialOfferText(offer, "ctaLabel", locale) || defaultCta;
  const offerTitle = localizedSpecialOfferText(offer, "title", locale) || (locale === "en" ? defaultCta : offer.title);
  const offerSubtitle = localizedSpecialOfferText(offer, "subtitle", locale);
  const offerBadge = localizedSpecialOfferText(offer, "badgeText", locale);
  const offerRibbon = localizedSpecialOfferText(offer, "ribbonText", locale);
  const offerMicrocopy = localizedSpecialOfferText(offer, "microcopy", locale);
  const jod = tr("plans.currency.jod");

  const hasOriginal =
    offer.originalPriceJod != null &&
    Number(offer.originalPriceJod) > Number(offer.priceJod);
  const discount = hasOriginal ? savePercent(offer.priceJod, offer.originalPriceJod) : null;

  const features = [
    {
      key: "offers",
      label: tr("plans.specialOffer.totalOffers"),
      value: `${formatAmount(offer.totalOffers)} ${tr("plans.specialOffer.available")}`,
      Icon: Target,
    },
    {
      key: "daily",
      label: tr("plans.specialOffer.dailyLimit"),
      value: `${formatAmount(offer.dailyLimit)} ${tr("plans.specialOffer.offersPerDay")}`,
      Icon: CalendarDays,
    },
    offer.maxProjectValueJod != null
      ? {
          key: "max",
          label: tr("plans.specialOffer.maxProject"),
          value: `${tr("plans.specialOffer.upTo")} ${formatAmount(offer.maxProjectValueJod)} ${jod} ${tr("plans.specialOffer.perProject")}`,
          Icon: Briefcase,
        }
      : {
          key: "max",
          label: tr("plans.specialOffer.maxProject"),
          value: tr("plans.specialOffer.unlimitedProjects"),
          Icon: Briefcase,
        },
    {
      key: "duration",
      label: tr("plans.specialOffer.durationShort"),
      value: `${offer.durationDays} ${tr("plans.specialOffer.days")}`,
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
      <span>{checkoutBusy ? tr("plans.specialOffer.checkoutBusy") : ctaLabel}</span>
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
      aria-label={offerTitle}
    >
      <div className="oh-special-offer-card__ribbon" aria-hidden="true">
        <span>{offerBadge || tr("plans.specialOffer.defaultBadge")}</span>
      </div>

      <div className="oh-special-offer-card__hero">
        <div className="oh-special-offer-card__limited">
          {offerRibbon || tr("plans.specialOffer.defaultRibbon")}
        </div>

        <header className="oh-special-offer-card__head">
          <h2 className="oh-special-offer-card__title">{offerTitle}</h2>
          {offerSubtitle ? <p className="oh-special-offer-card__subtitle">{offerSubtitle}</p> : null}
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
                  {tr("plans.specialOffer.savePercent", { percent: discount })}
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
          {(locale === "en" ? offerMicrocopy : offer.microcopy) ? (
            <p className="oh-special-offer-card__microcopy">
              <Check className="oh-special-offer-card__microcopy-icon" aria-hidden size={14} strokeWidth={2.5} />
              <span>{offerMicrocopy || (locale === "en" ? "" : offer.microcopy)}</span>
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
              <span>{tr("plans.specialOffer.refundDetailsLink")}</span>
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
