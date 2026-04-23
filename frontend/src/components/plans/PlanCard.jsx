import { useNavigate } from "react-router-dom";
import Button from "../ui/Button";
import { useAuth } from "../../context/useAuth";

function formatPriceSar(priceCents) {
  if (priceCents === null || priceCents === undefined) return null;
  const n = Number(priceCents);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return "مجانية";
  // Force English digits everywhere in UI
  return `${(n / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })} ر.س`;
}

function durationLabel(durationDays) {
  const d = Number(durationDays);
  if (!Number.isFinite(d) || d <= 0) return "";
  if (d === 30) return "شهرياً";
  if (d === 90) return "كل 3 أشهر";
  if (d === 365) return "سنوياً";
  return `${d} يوم`;
}

function deriveFeatures(plan) {
  if (Array.isArray(plan?.features) && plan.features.length > 0) {
    return plan.features.filter(Boolean).slice(0, 8);
  }

  const items = [];
  items.push(`مدة الاشتراك: ${Number(plan.durationDays)} يوم`);
  items.push("تجديد مرن حسب الخطة");
  items.push("لوحة تحكم للمستقل");
  items.push("أولوية دعم حسب الخطة");
  items.push("إدارة الطلبات والمطالبات");
  return items.slice(0, 6);
}

const PlanCard = ({ plan, featured = false, onCta, hasBlockingSubscription = false }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user ? user.primaryRole || user.role : null;
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const isGuest = !user;
  const isFreelancer = role === "freelancer" || roles.includes("freelancer");
  const isLoggedNonFreelancer = Boolean(user) && !isFreelancer;
  const isBlockedBySubscription = Boolean(user) && isFreelancer && hasBlockingSubscription;

  const price = formatPriceSar(plan.priceCents);
  const per = durationLabel(plan.durationDays);
  const features = deriveFeatures(plan);

  const ctaLabel = isLoggedNonFreelancer ? "للمستقلين فقط" : isBlockedBySubscription ? "مشترك بالفعل" : "ابدأ الآن";
  const usePrimaryCta = featured && (isFreelancer || isGuest);

  return (
    <article className={`pricing-card ${featured ? "pricing-card--featured" : ""}`.trim()}>
      <header className="pricing-card__head">
        <h2 className="pricing-card__title">{plan.title}</h2>
        {plan.description ? <p className="pricing-card__desc">{plan.description}</p> : null}
      </header>

      <div className="pricing-card__price">
        <div className="pricing-card__price-main">{price || "—"}</div>
        <div className="pricing-card__price-sub">{per}</div>
      </div>

      <div className="pricing-card__cta">
        <Button
          type="button"
          className={`pricing-card__btn ${usePrimaryCta ? "pricing-card__btn--featured" : ""} ${isLoggedNonFreelancer ? "pricing-card__btn--locked" : ""}`.trim()}
          variant={usePrimaryCta ? "primary" : "secondary"}
          disabled={isLoggedNonFreelancer || isBlockedBySubscription}
          onClick={() => {
            if (isGuest) {
              navigate("/login", { state: { from: { pathname: "/plans" } } });
              return;
            }
            if (!isFreelancer) return;
            if (isBlockedBySubscription) return;
            onCta?.(plan);
          }}
        >
          {ctaLabel}
        </Button>
      </div>

      <div className="pricing-card__divider" aria-hidden="true" />

      <ul className="pricing-card__features" aria-label="مميزات الباقة">
        {features.map((f) => (
          <li key={f} className="pricing-card__feature">
            <span className="pricing-card__check" aria-hidden="true">
              ✓
            </span>
            <span className="pricing-card__feature-text">{f}</span>
          </li>
        ))}
      </ul>
    </article>
  );
};

export default PlanCard;

