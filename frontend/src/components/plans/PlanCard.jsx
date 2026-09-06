import { useNavigate } from "react-router-dom";
import { useTranslation } from "../../i18n/LanguageProvider";
import Button from "../ui/Button";
import { useAuth } from "../../context/useAuth";
import { isOrderzhouseFreePlan } from "../../constants/orderzhousePlansCatalog";
import { isUpgradePlan, planTierRank, freePlanNeedsActivationFeeCheckout } from "../../utils/planSubscriptionUtils";
import { getLocalizedPlanBadge, getLocalizedPlanCardDisplay } from "../../lib/i18n/getLocalizedPlanDisplay";
import { getLocalizedField } from "../../lib/i18n/getLocalizedField";
import { useDisplayCurrency } from "../../hooks/useDisplayCurrency";
import { ApproximateCurrencyLine } from "../money/JodMoneyDisplay";
import MembershipPlanCardBody, { MembershipPlanTitle } from "./MembershipPlanCardBody";
import {
  isPaidMarketplaceMembershipTierCode,
  isStarterMarketplaceMembershipTierCode,
  resolveMarketplaceCheckoutPlanCode,
} from "../../lib/marketplaceMembership/marketplaceMembershipCheckoutUi";
import { isCurrentMarketplacePlanCard } from "../../lib/marketplaceMembership/marketplaceMembershipCurrentPlanUi";

const MOBILE_FEATURE_PREVIEW = 3;
const DESKTOP_PUBLIC_FEATURE_LIMIT = 5;

function getSubscriptionPlanRef(plan) {
  const id = plan?.checkoutPlanId || plan?.subscriptionPlanId || plan?.id;
  return { ...plan, id };
}

function FeatureItem({ text }) {
  return (
    <li className="pricing-card__feature">
      <span className="pricing-card__check" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="pricing-card__feature-text">{text}</span>
    </li>
  );
}

function DetailsChevron() {
  return (
    <svg
      className="pricing-card__details-chevron"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DetailsSummary({ className, children }) {
  return (
    <summary className={className}>
      <span className="pricing-card__details-label">{children}</span>
      <DetailsChevron />
    </summary>
  );
}

function OfferBlock({ label, className = "" }) {
  return (
    <p className={`pricing-card__offer ${className}`.trim()}>
      <span className="pricing-card__offer-icon" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
          <path
            d="M12 3 4 6v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V6l-8-3z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="pricing-card__offer-text">{label}</span>
    </p>
  );
}

const PlanCard = ({
  plan,
  featured = false,
  currentSubscription = null,
  currentMarketplaceMembership = null,
  onCta,
  hasBlockingSubscription = false,
  checkoutBusy = false,
  activationFeeNeedsPayment = false,
  activationFee = null,
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, locale } = useTranslation();
  const { resolvePlanPriceDisplay, formatFreePlanActivationFeeNote, isEgyptDisplay } = useDisplayCurrency();
  const role = user ? user.primaryRole || user.role : null;
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const isGuest = !user;
  const isFreelancer = role === "freelancer" || roles.includes("freelancer");
  const isLoggedNonFreelancer = Boolean(user) && !isFreelancer;
  const isMarketplaceMembership =
    plan?.catalogSource === "marketplace_membership" || Boolean(plan?.marketplaceMembership);
  const subscriptionRef = getSubscriptionPlanRef(plan);
  const isMarketplaceCurrentPlan = isMarketplaceMembership
    ? isCurrentMarketplacePlanCard(plan, currentMarketplaceMembership)
    : false;
  const isCurrentPlan =
    Boolean(currentSubscription) && String(currentSubscription.planId) === String(subscriptionRef.id);
  const isUpgradeTarget = isUpgradePlan(currentSubscription, subscriptionRef);
  const isLowerTier =
    Boolean(currentSubscription) &&
    planTierRank(subscriptionRef) < planTierRank(currentSubscription.plan ?? currentSubscription.planId);
  const isBlockedBySubscription =
    Boolean(user) && isFreelancer && hasBlockingSubscription && !isUpgradeTarget;
  const canSelfCheckout =
    plan?.selfCheckoutEligible == null ? true : Boolean(plan.selfCheckoutEligible);
  const isFreePlan =
    isOrderzhouseFreePlan(subscriptionRef) ||
    (Number(plan?.priceJod) === 0 && !canSelfCheckout);
  const freePlanPayFee = freePlanNeedsActivationFeeCheckout({
    isFreePlan,
    isFreelancer,
    activationFeeNeedsPayment,
  });
  const activationFeeAmountJod = activationFee?.amountJod;
  const isCurrentPlanLocked = isCurrentPlan && !freePlanPayFee;
  const customButtonLabel = getLocalizedField(plan, "buttonText", locale);

  const display = getLocalizedPlanCardDisplay(plan, locale, t);
  const displayedPrice = resolvePlanPriceDisplay(plan, display.price);
  const { main: priceMain, sub: priceSub, checkoutHint, sale: salePrice } = displayedPrice;
  const features = display.features;
  const extraFeatures = features.slice(MOBILE_FEATURE_PREVIEW);
  const desktopFeatures = features.slice(0, DESKTOP_PUBLIC_FEATURE_LIMIT);
  const orderRange = display.orderRange;
  const installment = display.installment;
  const paymentNotes = display.paymentNotes;
  const offerLabel = display.offerLabel;
  const planTitle = display.title;
  const badge = getLocalizedPlanBadge(plan, featured, locale, t);
  const billingText = getLocalizedField(plan, "billingText", locale);
  const durationDays = Number(plan?.durationDays);
  const durationLabel = billingText
    ? billingText
    : Number.isFinite(durationDays) && durationDays >= 365
      ? t("plans.fullYear")
      : Number.isFinite(durationDays) && durationDays > 0
        ? t("plans.days", { count: durationDays })
        : null;

  const ctaLabel = isMarketplaceMembership
    ? checkoutBusy
      ? t("common.loading.redirecting")
      : isMarketplaceCurrentPlan
        ? t("plans.cta.currentPlan")
        : typeof onCta === "function"
          ? isPaidMarketplaceMembershipTierCode(resolveMarketplaceCheckoutPlanCode(plan))
            ? t("plans.cta.buyMembership")
            : isStarterMarketplaceMembershipTierCode(resolveMarketplaceCheckoutPlanCode(plan))
              ? currentMarketplaceMembership?.hasMembership
                ? t("plans.cta.currentPlan")
                : t("plans.cta.viewMembership")
              : customButtonLabel || t("plans.cta.viewMembership")
          : customButtonLabel || t("plans.cta.viewMembership")
    : freePlanPayFee
      ? t("plans.cta.payActivationFee")
      : customButtonLabel
        ? customButtonLabel
        : isLoggedNonFreelancer
          ? t("plans.cta.freelancersOnly")
          : isCurrentPlanLocked
            ? t("plans.cta.currentPlan")
            : isLowerTier
              ? t("plans.cta.lowerPlan")
              : isBlockedBySubscription
                ? t("plans.cta.alreadySubscribed")
                : checkoutBusy
                  ? t("common.loading.redirecting")
                  : isFreelancer && isUpgradeTarget && canSelfCheckout
                    ? t("plans.cta.upgrade")
                    : isFreelancer && canSelfCheckout
                      ? t("plans.cta.upgrade")
                      : isFreelancer && isFreePlan
                        ? t("plans.cta.autoActivated")
                        : isFreelancer && !canSelfCheckout
                          ? t("plans.cta.companyActivation")
                          : t("plans.cta.startNow");
  const usePrimaryCta = isMarketplaceMembership
    ? Boolean(
        !isMarketplaceCurrentPlan &&
          isPaidMarketplaceMembershipTierCode(resolveMarketplaceCheckoutPlanCode(plan)) &&
          ((typeof onCta === "function" && isFreelancer) ||
            (featured && (isGuest || isFreelancer) && !isLoggedNonFreelancer)),
      )
    : featured &&
      (isGuest || (isFreelancer && (canSelfCheckout || freePlanPayFee))) &&
      !isBlockedBySubscription &&
      !isCurrentPlanLocked;
  const isLocked = isMarketplaceMembership
    ? isLoggedNonFreelancer ||
      isMarketplaceCurrentPlan ||
      isStarterMarketplaceMembershipTierCode(resolveMarketplaceCheckoutPlanCode(plan)) ||
      (typeof onCta === "function" && checkoutBusy)
    : isLoggedNonFreelancer ||
      isCurrentPlanLocked ||
      isLowerTier ||
      isBlockedBySubscription ||
      checkoutBusy ||
      (isFreelancer && isFreePlan && !freePlanPayFee) ||
      (isFreelancer && !canSelfCheckout && !isCurrentPlan && !isUpgradeTarget && !freePlanPayFee);

  const hasExtras = Boolean(
    offerLabel || orderRange || display.activationRequirements || display.refundPolicy,
  );

  const showPopularChip =
    !isMarketplaceMembership &&
    featured &&
    (plan?.isPopular === true || plan?.is_popular === true);
  const tierModifier = isMarketplaceMembership
    ? `pricing-card--tier-${String(plan?.tierCode || "")
        .trim()
        .toLowerCase()}`
    : "";

  const handleCtaClick = () => {
    if (isMarketplaceMembership) {
      if (isGuest) {
        navigate("/login", { state: { from: { pathname: "/dashboard/freelancer/plans" } } });
        return;
      }
      if (!isFreelancer) return;
      if (typeof onCta === "function") {
        if (checkoutBusy) return;
        onCta(plan);
        return;
      }
      navigate("/dashboard/freelancer/plans");
      return;
    }
    if (isGuest) {
      navigate("/login", { state: { from: { pathname: "/plans" } } });
      return;
    }
    if (!isFreelancer) return;
    if (isBlockedBySubscription) return;
    if (freePlanPayFee) {
      onCta?.(plan);
      return;
    }
    if (!canSelfCheckout) return;
    onCta?.(plan);
  };

  return (
    <article
      className={[
        "pricing-card",
        isMarketplaceMembership ? "pricing-card--membership" : "",
        tierModifier,
        featured ? "pricing-card--featured" : "",
        isCurrentPlan ? "pricing-card--current" : "",
        salePrice?.active ? "pricing-card--sale" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {isMarketplaceMembership ? (
        <>
          <MembershipPlanTitle plan={plan} featured={featured} locale={locale} t={t} />
          <MembershipPlanCardBody plan={plan} locale={locale} t={t} />
        </>
      ) : (
        <>
          {badge ? (
            <span className="pricing-card__badge" aria-hidden="true">
              {badge}
            </span>
          ) : null}

          <header className="pricing-card__head">
            <h2 className="pricing-card__title">{planTitle}</h2>
            {display.description ? <p className="pricing-card__desc">{display.description}</p> : null}
            {durationLabel ? <p className="pricing-card__duration">{durationLabel}</p> : null}
          </header>

          {display.priceIntroText ? (
            <p className="pricing-card__price-intro">{display.priceIntroText}</p>
          ) : null}

          {offerLabel ? <OfferBlock label={offerLabel} className="pricing-card__offer--inline" /> : null}

          <div className="pricing-card__price">
            {salePrice?.active ? (
              <div className="pricing-card__price-sale">
                <div className="pricing-card__price-main">{priceMain}</div>
                {salePrice.original || salePrice.badge ? (
                  <p className="pricing-card__price-sale-meta">
                    {salePrice.original ? (
                      <s className="pricing-card__price-original">{salePrice.original}</s>
                    ) : null}
                    {salePrice.badge ? (
                      <span className="pricing-card__sale-badge">{salePrice.badge}</span>
                    ) : null}
                  </p>
                ) : null}
                {salePrice.reason ? (
                  <p className="pricing-card__sale-reason">{salePrice.reason}</p>
                ) : null}
              </div>
            ) : (
              <>
                <div className="pricing-card__price-main">{priceMain}</div>
                {priceSub ? <div className="pricing-card__price-sub">{priceSub}</div> : null}
              </>
            )}
            {checkoutHint && isEgyptDisplay ? (
              <p className="pricing-card__price-note pricing-card__checkout-hint">{checkoutHint}</p>
            ) : null}
            {!isEgyptDisplay ? (
              <ApproximateCurrencyLine
                amount={
                  salePrice?.active && plan?.effectivePriceJod != null
                    ? plan.effectivePriceJod
                    : plan?.priceJod
                }
              />
            ) : null}
            {installment ? <p className="pricing-card__price-note">{installment}</p> : null}
            {!installment && paymentNotes ? <p className="pricing-card__price-note">{paymentNotes}</p> : null}
            {freePlanPayFee ? (
              <p className="pricing-card__price-note pricing-card__activation-fee-required">
                {formatFreePlanActivationFeeNote(activationFeeAmountJod)}
              </p>
            ) : null}
          </div>

          <div className="pricing-card__divider pricing-card__divider--features" aria-hidden="true" />

          <div className="pricing-card__benefits">
            {showPopularChip ? (
              <p className="pricing-card__popular-chip">
                <span className="pricing-card__popular-chip-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                    <path d="M12 2l2.39 4.84L20 7.77l-3.64 3.55.86 5.02L12 14.77l-5.22 2.57.86-5.02L4 7.77l5.61-.93L12 2z" />
                  </svg>
                </span>
                {t("plans.badges.mostPopular")}
              </p>
            ) : null}

            <ul className="pricing-card__features pricing-card__features--desktop" aria-label={t("plans.featuresAria")}>
              {desktopFeatures.map((f, idx) => (
                <FeatureItem key={`desk-${String(f)}-${idx}`} text={f} />
              ))}
            </ul>
            <ul className="pricing-card__features pricing-card__features--mobile" aria-label={t("plans.featuresAria")}>
              {features.map((f, idx) => (
                <FeatureItem key={`${String(f)}-${idx}`} text={f} />
              ))}
            </ul>

            {extraFeatures.length > 0 ? (
              <details className="pricing-card__more-features">
                <DetailsSummary className="pricing-card__more-features-summary pricing-card__details-row">
                  {t("plans.showFeatures", { count: extraFeatures.length })}
                </DetailsSummary>
                <ul className="pricing-card__features pricing-card__features--more" aria-label={t("plans.extraFeaturesAria")}>
                  {extraFeatures.map((f, idx) => (
                    <FeatureItem key={`more-${String(f)}-${idx}`} text={f} />
                  ))}
                </ul>
              </details>
            ) : null}
          </div>

          <div className="pricing-card__meta-desktop">
            {orderRange ? <p className="pricing-card__order-range">{orderRange}</p> : null}
            {display.activationRequirements ? (
              <p className="pricing-card__activation">{display.activationRequirements}</p>
            ) : null}
            {display.refundPolicy ? <p className="pricing-card__footnote">{display.refundPolicy}</p> : null}
          </div>

          {hasExtras ? (
            <details className="pricing-card__extras">
              <DetailsSummary className="pricing-card__extras-summary pricing-card__details-row">
                {t("plans.extraDetails")}
              </DetailsSummary>
              <div className="pricing-card__extras-body">
                {offerLabel ? (
                  <div className="pricing-card__extras-block pricing-card__extras-block--offer">
                    <OfferBlock label={offerLabel} className="pricing-card__offer--in-extras" />
                  </div>
                ) : null}
                {orderRange ? (
                  <div className="pricing-card__extras-block">
                    <p className="pricing-card__order-range">{orderRange}</p>
                  </div>
                ) : null}
                {display.activationRequirements ? (
                  <div className="pricing-card__extras-block">
                    <p className="pricing-card__activation">{display.activationRequirements}</p>
                  </div>
                ) : null}
                {display.refundPolicy ? (
                  <div className="pricing-card__extras-block">
                    <p className="pricing-card__footnote">{display.refundPolicy}</p>
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}
        </>
      )}

      <div className="pricing-card__cta">
        <Button
          type="button"
          className={`pricing-card__btn ${usePrimaryCta ? "pricing-card__btn--featured pricing-card__btn--fill" : "pricing-card__btn--outline"} ${isLocked ? "pricing-card__btn--locked" : ""}`.trim()}
          variant={usePrimaryCta ? "primary" : "secondary"}
          disabled={isLocked}
          onClick={handleCtaClick}
        >
          {ctaLabel}
        </Button>
      </div>
    </article>
  );
};

export default PlanCard;
