import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/useAuth";
import { isOrderzhouseFreePlan } from "../../../constants/orderzhousePlansCatalog";
import { isUpgradePlan, planTierRank } from "../../../utils/planSubscriptionUtils";
import {
  formatInstallmentSummary,
  formatOrderValueRange,
  isOfferActive,
  planBadgeLabel,
  planListItems,
  planPriceHeadline,
} from "../planDisplayUtils";

const FEATURE_PREVIEW = 4;

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
  const [expanded, setExpanded] = useState(false);

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

  const { main: priceMain, sub: priceSub } = planPriceHeadline(plan);
  const features = planListItems(plan);
  const previewFeatures = features.slice(0, FEATURE_PREVIEW);
  const moreFeatures = features.slice(FEATURE_PREVIEW);
  const orderRange = formatOrderValueRange(plan);
  const installment = formatInstallmentSummary(plan);
  const paymentNotes = plan?.paymentNotes ? String(plan.paymentNotes).trim() : "";
  const offerActive = isOfferActive(plan);
  const offerLabel = offerActive && plan.offerLabel ? String(plan.offerLabel).trim() : "";
  const planTitle = plan.title || plan.name || "—";
  const badge = planBadgeLabel(plan, featured);
  const durationDays = Number(plan?.durationDays);
  const durationLabel =
    Number.isFinite(durationDays) && durationDays >= 365
      ? "سنة كاملة"
      : Number.isFinite(durationDays) && durationDays > 0
        ? `${durationDays} يوم`
        : null;

  const ctaLabel = isLoggedNonFreelancer
    ? "للمستقلين فقط"
    : isCurrentPlan
      ? "باقتك الحالية"
      : isLowerTier
        ? "باقة أقل"
        : isBlockedBySubscription
          ? "مشترك بالفعل"
          : checkoutBusy
            ? "جارٍ التحويل…"
            : isFreelancer && isUpgradeTarget && canSelfCheckout
              ? "ترقية الاشتراك"
              : isFreelancer && canSelfCheckout
                ? "ترقية الاشتراك"
                : isFreelancer && isFreePlan
                  ? "مفعّل تلقائياً"
                  : isFreelancer && !canSelfCheckout
                    ? "يتم التفعيل عبر الشركة"
                    : "ابدأ الآن";

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

  const hasMeta = Boolean(offerLabel || orderRange || plan.activationRequirements || plan.refundPolicy);

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
        {plan.description ? <p className="pm-plan-card__desc">{plan.description}</p> : null}
        {durationLabel ? <p className="pm-plan-card__duration">{durationLabel}</p> : null}
      </div>

      <div className="pm-plan-card__price">
        <span className="pm-plan-card__price-main">{priceMain}</span>
        {priceSub ? <span className="pm-plan-card__price-sub">{priceSub}</span> : null}
        {installment ? <p className="pm-plan-card__price-note">{installment}</p> : null}
        {!installment && paymentNotes ? <p className="pm-plan-card__price-note">{paymentNotes}</p> : null}
      </div>

      {offerLabel ? <p className="pm-plan-card__offer">{offerLabel}</p> : null}

      <ul className="pm-plan-card__features" aria-label="مميزات الباقة">
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
          {expanded ? "إخفاء المزايا" : `عرض ${moreFeatures.length} ميزة إضافية`}
        </button>
      ) : null}

      {expanded && moreFeatures.length > 0 ? (
        <ul className="pm-plan-card__features pm-plan-card__features--more" aria-label="مزايا إضافية">
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
          {plan.activationRequirements ? <p>{plan.activationRequirements}</p> : null}
          {plan.refundPolicy ? <p>{plan.refundPolicy}</p> : null}
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
