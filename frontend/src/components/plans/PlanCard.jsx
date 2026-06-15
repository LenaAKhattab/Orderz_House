import { useNavigate } from "react-router-dom";
import { useTranslation } from "../../i18n/LanguageProvider";
import Button from "../ui/Button";
import { useAuth } from "../../context/useAuth";
import { isOrderzhouseFreePlan } from "../../constants/orderzhousePlansCatalog";
import { isUpgradePlan, planTierRank } from "../../utils/planSubscriptionUtils";
import { getLocalizedPlanBadge, getLocalizedPlanCardDisplay } from "../../lib/i18n/getLocalizedPlanDisplay";

const MOBILE_FEATURE_PREVIEW = 3;

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
  onCta,
  hasBlockingSubscription = false,
  checkoutBusy = false,
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, locale } = useTranslation();
  const role = user ? user.primaryRole || user.role : null;
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const isGuest = !user;
  const isFreelancer = role === "freelancer" || roles.includes("freelancer");
  const isLoggedNonFreelancer = Boolean(user) && !isFreelancer;
  const isCurrentPlan =
    Boolean(currentSubscription) && String(currentSubscription.planId) === String(plan.id);
  const isUpgradeTarget = isUpgradePlan(currentSubscription, plan);
  const isLowerTier =
    Boolean(currentSubscription) &&
    planTierRank(plan) < planTierRank(currentSubscription.plan ?? currentSubscription.planId);
  const isBlockedBySubscription =
    Boolean(user) && isFreelancer && hasBlockingSubscription && !isUpgradeTarget;
  const isFreePlan = isOrderzhouseFreePlan(plan);
  const canSelfCheckout =
    plan?.selfCheckoutEligible == null ? true : Boolean(plan.selfCheckoutEligible);

  const display = getLocalizedPlanCardDisplay(plan, locale, t);
  const { main: priceMain, sub: priceSub } = display.price;
  const features = display.features;
  const extraFeatures = features.slice(MOBILE_FEATURE_PREVIEW);
  const orderRange = display.orderRange;
  const installment = display.installment;
  const paymentNotes = display.paymentNotes;
  const offerLabel = display.offerLabel;
  const planTitle = display.title;
  const badge = getLocalizedPlanBadge(plan, featured, locale, t);
  const durationDays = Number(plan?.durationDays);
  const durationLabel =
    Number.isFinite(durationDays) && durationDays >= 365
      ? t("plans.fullYear")
      : Number.isFinite(durationDays) && durationDays > 0
        ? t("plans.days", { count: durationDays })
        : null;

  const ctaLabel = isLoggedNonFreelancer
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

  const hasExtras = Boolean(
    offerLabel || orderRange || display.activationRequirements || display.refundPolicy,
  );

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

  return (
    <article
      className={[
        "pricing-card",
        featured ? "pricing-card--featured" : "",
        isCurrentPlan ? "pricing-card--current" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
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

      {offerLabel ? <OfferBlock label={offerLabel} className="pricing-card__offer--inline" /> : null}

      <div className="pricing-card__price">
        <div className="pricing-card__price-main">{priceMain}</div>
        {priceSub ? <div className="pricing-card__price-sub">{priceSub}</div> : null}
        {installment ? <p className="pricing-card__price-note">{installment}</p> : null}
        {!installment && paymentNotes ? <p className="pricing-card__price-note">{paymentNotes}</p> : null}
      </div>

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

      <div className="pricing-card__divider pricing-card__divider--features" aria-hidden="true" />

      <div className="pricing-card__benefits">
        <ul className="pricing-card__features" aria-label={t("plans.featuresAria")}>
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
    </article>
  );
};

export default PlanCard;
