import { useNavigate } from "react-router-dom";
import Button from "../ui/Button";
import { useAuth } from "../../context/useAuth";

function formatPriceJod(priceJod) {
  if (priceJod === null || priceJod === undefined) return null;
  const n = Number(priceJod);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return "مجانية";
  // Force English digits everywhere in UI
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} د.أ`;
}

function deriveFeatures(plan) {
  let raw = plan?.features;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.filter(Boolean).map(String).slice(0, 12);
  }

  const items = [];
  const d = Number(plan?.durationDays);
  if (Number.isFinite(d) && d > 0) {
    items.push(`مدة الاشتراك: ${d} يوم`);
  }
  items.push("تجديد مرن حسب الخطة");
  items.push("لوحة تحكم للمستقل");
  items.push("أولوية دعم حسب الخطة");
  items.push("إدارة الطلبات والمطالبات");
  return items.slice(0, 8);
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

  const price = formatPriceJod(plan?.priceJod);
  const features = deriveFeatures(plan);
  const planTitle = plan.title || plan.name || "—";

  const ctaLabel = isLoggedNonFreelancer ? "للمستقلين فقط" : isBlockedBySubscription ? "مشترك بالفعل" : "ابدأ الآن";
  const usePrimaryCta = featured && (isFreelancer || isGuest) && !isBlockedBySubscription;
  const isLocked = isLoggedNonFreelancer || isBlockedBySubscription;

  return (
    <article className={`pricing-card ${featured ? "pricing-card--featured" : ""}`.trim()}>
      {featured ? (
        <span className="pricing-card__badge" aria-hidden="true">
          الأكثر شيوعًا
        </span>
      ) : null}

      <header className="pricing-card__head">
        <h2 className="pricing-card__title">{planTitle}</h2>
        {plan.description ? <p className="pricing-card__desc">{plan.description}</p> : null}
      </header>

      <div className="pricing-card__price">
        <div className="pricing-card__price-main">{price || "—"}</div>
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

