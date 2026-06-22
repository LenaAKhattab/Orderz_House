import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/useAuth";
import { isOrderzhouseFreePlan } from "../../../constants/orderzhousePlansCatalog";
import { isUpgradePlan, planTierRank } from "../../../utils/planSubscriptionUtils";
import { getLocalizedPlanBadge, getLocalizedPlanCardDisplay } from "../../../lib/i18n/getLocalizedPlanDisplay";
import { getLocalizedField } from "../../../lib/i18n/getLocalizedField";
import { useTranslation } from "../../../i18n/LanguageProvider";

const FEATURE_PREVIEW = 4;

function getSubscriptionPlanRef(plan) {
  const id = plan?.checkoutPlanId || plan?.subscriptionPlanId || plan?.id;
  return { ...plan, id };
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * @param {{
 *   plan: object;
 *   featured?: boolean;
 *   currentSubscription?: object | null;
 *   hasBlockingSubscription?: boolean;
 *   checkoutBusy?: boolean;
 *   onCta?: (plan: object) => void;
 * }} p
 */
export default function PlansMobilePlanCard({
  plan,
  featured = false,
  currentSubscription = null,
  onCta,
  hasBlockingSubscription = false,
  checkoutBusy = false,
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, locale } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const role = user ? user.primaryRole || user.role : null;
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const isGuest = !user;
  const isFreelancer = role === "freelancer" || roles.includes("freelancer");
  const isLoggedNonFreelancer = Boolean(user) && !isFreelancer;
  const subscriptionRef = getSubscriptionPlanRef(plan);
  const isCurrentPlan =
    Boolean(currentSubscription) && String(currentSubscription.planId) === String(subscriptionRef.id);
  const isUpgradeTarget = isUpgradePlan(currentSubscription, subscriptionRef);
  const isLowerTier =
    Boolean(currentSubscription) &&
    planTierRank(subscriptionRef) < planTierRank(currentSubscription.plan ?? currentSubscription.planId);
  const isBlockedBySubscription =
    Boolean(user) && isFreelancer && hasBlockingSubscription && !isUpgradeTarget;
  const isFreePlan =
    isOrderzhouseFreePlan(subscriptionRef) ||
    (Number(plan?.priceJod) === 0 && !canSelfCheckout);
  const canSelfCheckout =
    plan?.selfCheckoutEligible == null ? true : Boolean(plan.selfCheckoutEligible);
  const customButtonLabel = getLocalizedField(plan, "buttonText", locale);

  const display = getLocalizedPlanCardDisplay(plan, locale, t);
  const { main: priceMain, sub: priceSub } = display.price;
  const features = display.features;
  const previewFeatures = features.slice(0, FEATURE_PREVIEW);
  const moreFeatures = features.slice(FEATURE_PREVIEW);
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

  const ctaLabel = customButtonLabel
    ? customButtonLabel
    : isLoggedNonFreelancer
    ? t("plans.cta.freelancersOnly")
    : isCurrentPlan
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

  const usePrimaryCta =
    featured &&
    (isGuest || (isFreelancer && canSelfCheckout)) &&
    !isBlockedBySubscription &&
    !isCurrentPlan;

  const isLocked =
    isLoggedNonFreelancer ||
    isCurrentPlan ||
    isLowerTier ||
    isBlockedBySubscription ||
    checkoutBusy ||
    (isFreelancer && isFreePlan) ||
    (isFreelancer && !canSelfCheckout && !isCurrentPlan && !isUpgradeTarget);

  const handleCtaClick = () => {
    if (isGuest) {
      navigate("/login", { state: { from: { pathname: "/plans" } } });
      return;
    }
    if (!isFreelancer) return;
    if (isBlockedBySubscription) return;
    if (!canSelfCheckout) return;
    onCta?.(plan);
  };

  const hasMeta = Boolean(offerLabel || orderRange || display.activationRequirements || display.refundPolicy);

  return (
    <article
      className={[
        "pm-plan-card",
        featured ? "pm-plan-card--featured" : "",
        isCurrentPlan ? "pm-plan-card--current" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {badge ? <span className="pm-plan-card__badge">{badge}</span> : null}

      <div className="pm-plan-card__head">
        <h2 className="pm-plan-card__title">{planTitle}</h2>
        {display.description ? <p className="pm-plan-card__desc">{display.description}</p> : null}
        {durationLabel ? <p className="pm-plan-card__duration">{durationLabel}</p> : null}
      </div>

      <div className="pm-plan-card__price">
        <span className="pm-plan-card__price-main">{priceMain}</span>
        {priceSub ? <span className="pm-plan-card__price-sub">{priceSub}</span> : null}
        {installment ? <p className="pm-plan-card__price-note">{installment}</p> : null}
        {!installment && paymentNotes ? <p className="pm-plan-card__price-note">{paymentNotes}</p> : null}
      </div>

      {offerLabel ? <p className="pm-plan-card__offer">{offerLabel}</p> : null}

      <ul className="pm-plan-card__features" aria-label={t("plans.featuresAria")}>
        {previewFeatures.map((text, idx) => (
          <li key={`${text}-${idx}`} className="pm-plan-card__feature">
            <span className="pm-plan-card__check">
              <CheckIcon />
            </span>
            <span>{text}</span>
          </li>
        ))}
      </ul>

      {moreFeatures.length > 0 ? (
        <button
          type="button"
          className="pm-plan-card__more"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? t("plans.hideFeatures") : t("plans.showMoreFeatures", { count: moreFeatures.length })}
        </button>
      ) : null}

      {expanded && moreFeatures.length > 0 ? (
        <ul className="pm-plan-card__features pm-plan-card__features--more" aria-label={t("plans.extraFeaturesAria")}>
          {moreFeatures.map((text, idx) => (
            <li key={`more-${text}-${idx}`} className="pm-plan-card__feature">
              <span className="pm-plan-card__check">
                <CheckIcon />
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {hasMeta ? (
        <div className="pm-plan-card__meta">
          {orderRange ? <p>{orderRange}</p> : null}
          {display.activationRequirements ? <p>{display.activationRequirements}</p> : null}
          {display.refundPolicy ? <p>{display.refundPolicy}</p> : null}
        </div>
      ) : null}

      <button
        type="button"
        className={[
          "pm-plan-card__cta",
          usePrimaryCta ? "pm-plan-card__cta--primary" : "pm-plan-card__cta--ghost",
          isLocked ? "pm-plan-card__cta--locked" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={isLocked}
        onClick={handleCtaClick}
      >
        {ctaLabel}
      </button>
    </article>
  );
}
