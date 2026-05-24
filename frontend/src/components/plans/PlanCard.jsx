import { useNavigate } from "react-router-dom";
import Button from "../ui/Button";
import { useAuth } from "../../context/useAuth";
import { isOrderzhouseFreePlan } from "../../constants/orderzhousePlansCatalog";
import {
  formatInstallmentSummary,
  formatOrderValueRange,
  isOfferActive,
  planBadgeLabel,
  planListItems,
  planPriceHeadline,
} from "./planDisplayUtils";

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
  const role = user ? user.primaryRole || user.role : null;
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const isGuest = !user;
  const isFreelancer = role === "freelancer" || roles.includes("freelancer");
  const isLoggedNonFreelancer = Boolean(user) && !isFreelancer;
  const isBlockedBySubscription = Boolean(user) && isFreelancer && hasBlockingSubscription;
  const isCurrentPlan =
    Boolean(currentSubscription) && String(currentSubscription.planId) === String(plan.id);
  const isFreePlan = isOrderzhouseFreePlan(plan);
  const canSelfCheckout =
    plan?.selfCheckoutEligible == null ? true : Boolean(plan.selfCheckoutEligible);

  const { main: priceMain, sub: priceSub } = planPriceHeadline(plan);
  const features = planListItems(plan);
  const orderRange = formatOrderValueRange(plan);
  const installment = formatInstallmentSummary(plan);
  const paymentNotes = plan?.paymentNotes ? String(plan.paymentNotes).trim() : "";
  const offerActive = isOfferActive(plan);
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
      : isBlockedBySubscription
        ? "مشترك بالفعل"
        : checkoutBusy
          ? "جارٍ التحويل…"
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
    isBlockedBySubscription ||
    checkoutBusy ||
    (isFreelancer && isFreePlan) ||
    (isFreelancer && !canSelfCheckout && !isCurrentPlan);

  return (
    <article className={`pricing-card ${featured ? "pricing-card--featured" : ""}`.trim()}>
      {badge ? (
        <span className="pricing-card__badge" aria-hidden="true">
          {badge}
        </span>
      ) : null}

      <header className="pricing-card__head">
        <h2 className="pricing-card__title">{planTitle}</h2>
        {plan.description ? <p className="pricing-card__desc">{plan.description}</p> : null}
        {durationLabel ? <p className="pricing-card__duration">{durationLabel}</p> : null}
      </header>

      {offerActive && plan.offerLabel ? (
        <p className="pricing-card__offer">
          <span className="pricing-card__offer-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 3 4 6v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V6l-8-3z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="pricing-card__offer-text">{plan.offerLabel}</span>
        </p>
      ) : null}

      <div className="pricing-card__price">
        <div className="pricing-card__price-main">{priceMain}</div>
        {priceSub ? <div className="pricing-card__price-sub">{priceSub}</div> : null}
        {installment ? <p className="pricing-card__price-note">{installment}</p> : null}
        {!installment && paymentNotes ? <p className="pricing-card__price-note">{paymentNotes}</p> : null}
      </div>

      <div className="pricing-card__divider" aria-hidden="true" />

      <ul className="pricing-card__features" aria-label="مميزات الباقة">
        {features.map((f, idx) => (
          <li key={`${String(f)}-${idx}`} className="pricing-card__feature">
            <span className="pricing-card__check" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="pricing-card__feature-text">{f}</span>
          </li>
        ))}
      </ul>

      {orderRange ? <p className="pricing-card__order-range">{orderRange}</p> : null}

      {plan.activationRequirements ? (
        <p className="pricing-card__activation">{plan.activationRequirements}</p>
      ) : null}

      {plan.refundPolicy ? <p className="pricing-card__footnote">{plan.refundPolicy}</p> : null}

      <div className="pricing-card__cta">
        <Button
          type="button"
          className={`pricing-card__btn ${usePrimaryCta ? "pricing-card__btn--featured pricing-card__btn--fill" : "pricing-card__btn--outline"} ${isLocked ? "pricing-card__btn--locked" : ""}`.trim()}
          variant={usePrimaryCta ? "primary" : "secondary"}
          disabled={isLocked}
          onClick={() => {
            if (isGuest) {
              navigate("/login", { state: { from: { pathname: "/plans" } } });
              return;
            }
            if (!isFreelancer) return;
            if (isBlockedBySubscription) return;
            if (!canSelfCheckout) return;
            onCta?.(plan);
          }}
        >
          {ctaLabel}
        </Button>
      </div>
    </article>
  );
};

export default PlanCard;
