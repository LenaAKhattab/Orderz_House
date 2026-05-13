import Button from "../../components/ui/Button";
import PlanStatusBadge from "./PlanStatusBadge";
import PlanToggle from "./PlanToggle";

function formatPriceJod(priceJod) {
  if (priceJod == null || Number.isNaN(Number(priceJod))) return "—";
  return `${Number(priceJod).toLocaleString("en-US")} د.أ`;
}

/**
 * @param {{
 *   plan: Record<string, unknown>;
 *   submitting: boolean;
 *   onActiveChange: (plan: Record<string, unknown>, nextActive: boolean) => void;
 *   onEdit: () => void;
 *   onDelete: () => void;
 * }} p
 */
export default function AdminPlanCard({ plan, submitting, onActiveChange, onEdit, onDelete }) {
  const showMarketplaceBadge =
    plan.isActive && plan.isVisible && plan.selfSubscribeAllowed && plan.priceJod != null && Number(plan.priceJod) > 0;

  return (
    <article className="oh-sapl-card">
      <div className="oh-sapl-card__top">
        <div className="oh-sapl-card__titles">
          <h3 className="oh-sapl-card__title">{plan.title}</h3>
          <p className="oh-sapl-card__meta">
            <code className="oh-sapl-card__code">{plan.name}</code>
            <span className="oh-sapl-card__dot" aria-hidden>
              ·
            </span>
            <span>ترتيب {plan.sortOrder ?? 0}</span>
          </p>
        </div>
        <div className="oh-sapl-card__active">
          <span className="oh-sapl-card__active-label">تشغيل سريع</span>
          <PlanToggle
            compact
            ariaLabel={`${plan.isActive ? "تعطيل" : "تفعيل"} الباقة «${plan.title}»`}
            checked={Boolean(plan.isActive)}
            disabled={submitting}
            onChange={(next) => onActiveChange(plan, next)}
          />
        </div>
      </div>

      <dl className="oh-sapl-card__stats">
        <div className="oh-sapl-card__stat">
          <dt>السعر</dt>
          <dd>{formatPriceJod(plan.priceJod)}</dd>
        </div>
        <div className="oh-sapl-card__stat">
          <dt>المدة</dt>
          <dd>{plan.durationDays} يوم</dd>
        </div>
      </dl>

      <div className="oh-sapl-card__badges">
        <PlanStatusBadge variant={plan.isActive ? "active" : "inactive"} />
        <PlanStatusBadge variant={plan.isVisible ? "visible" : "hidden"} />
        {plan.requiresCompanyVisit ? <PlanStatusBadge variant="visit" /> : null}
        {plan.selfSubscribeAllowed ? <PlanStatusBadge variant="selfServe" /> : null}
        {showMarketplaceBadge ? <PlanStatusBadge variant="listed" /> : null}
      </div>

      <div className="oh-sapl-card__actions">
        <Button type="button" variant="secondary" disabled={submitting} onClick={onEdit}>
          تعديل
        </Button>
        <Button type="button" variant="secondary" className="oh-sapl-btn--danger" disabled={submitting} onClick={onDelete}>
          حذف
        </Button>
      </div>
    </article>
  );
}
