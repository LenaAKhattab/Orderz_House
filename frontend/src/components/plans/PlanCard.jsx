import { useNavigate } from "react-router-dom";
import Button from "../ui/Button";
import { useAuth } from "../../context/useAuth";
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
    : isBlockedBySubscription
      ? "مشترك بالفعل"
      : checkoutBusy
        ? "جارٍ التحويل…"
        : isFreelancer && !canSelfCheckout
          ? "يتم التفعيل عبر الشركة"
          : "ابدأ الآن";
  const usePrimaryCta =
    featured &&
    (isGuest || (isFreelancer && canSelfCheckout)) &&
    !isBlockedBySubscription;
  const isLocked =
    isLoggedNonFreelancer ||
    isBlockedBySubscription ||
    checkoutBusy ||
    (isFreelancer && !canSelfCheckout);

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
        <p className="pricing-card__offer">{plan.offerLabel}</p>
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
              ✓
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
