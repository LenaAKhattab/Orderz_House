import Button from "../../components/ui/Button";
import PlanStatusBadge from "./PlanStatusBadge";
import PlanToggle from "./PlanToggle";
import { formatOrderValueRange, formatPriceJod, PLAN_CARD_FEATURES } from "./planDisplayUtils";

/**
 * @param {{
 *   plan: Record<string, unknown>;
 *   submitting: boolean;
 *   onActiveChange: (plan: Record<string, unknown>, nextActive: boolean) => void;
 *   onEdit: () => void;
 *   onManageDetails: () => void;
 *   onDelete: () => void;
 * }} p
 */
export default function AdminPlanCard({
  plan,
  submitting,
  onActiveChange,
  onEdit,
  onManageDetails,
  onDelete,
}) {
  const priceLabel = formatPriceJod(plan.priceJod);
  const orderRange = formatOrderValueRange(plan.orderValueMinJod, plan.orderValueMaxJod);
  const enabledFeatures = PLAN_CARD_FEATURES.filter((row) => Boolean(plan[row.key]));

  return (
    <article className={`oh-sapl-card${plan.isActive ? "" : " oh-sapl-card--inactive"}`}>
      <header className="oh-sapl-card__header">
        <div className="oh-sapl-card__header-main">
          <div className="oh-sapl-card__title-row">
            <h3 className="oh-sapl-card__title">{plan.title}</h3>
            <PlanStatusBadge variant={plan.isActive ? "active" : "inactive"} />
          </div>
          <p className="oh-sapl-card__slug">
            <code className="oh-sapl-card__code">{plan.name}</code>
          </p>
        </div>
        <div className="oh-sapl-card__header-toggle">
          <span className="oh-sapl-card__active-label">تشغيل سريع</span>
          <PlanToggle
            compact
            ariaLabel={`${plan.isActive ? "تعطيل" : "تفعيل"} الباقة «${plan.title}»`}
            checked={Boolean(plan.isActive)}
            disabled={submitting}
            onChange={(next) => onActiveChange(plan, next)}
          />
        </div>
      </header>

      <div className="oh-sapl-card__body">
        <p className="oh-sapl-card__price">{priceLabel ?? "مجانية"}</p>

        <div className="oh-sapl-card__meta-row">
          <span>{plan.durationDays} يوم</span>
          <span className="oh-sapl-card__meta-sep" aria-hidden>
            ·
          </span>
          <span>ترتيب #{plan.sortOrder ?? 0}</span>
        </div>

        {orderRange ? (
          <div className="oh-sapl-card__order-range">
            <span className="oh-sapl-card__order-range-label">قيمة الطلبات:</span>
            <strong className="oh-sapl-card__order-range-value">{orderRange}</strong>
          </div>
        ) : null}

        {enabledFeatures.length > 0 ? (
          <ul className="oh-sapl-card__features" aria-label="ميزات مفعّلة">
            {enabledFeatures.map((row) => (
              <li key={row.key} className="oh-sapl-card__feature">
                <span className="oh-sapl-card__feature-check" aria-hidden>
                  ✓
                </span>
                <span>{row.label}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="oh-sapl-card__features-empty">لا توجد ميزات إضافية مفعّلة</p>
        )}
      </div>

      <footer className="oh-sapl-card__footer">
        <Button type="button" disabled={submitting} onClick={onEdit}>
          تعديل الباقة
        </Button>
        <Button type="button" variant="secondary" disabled={submitting} onClick={onManageDetails}>
          إدارة التفاصيل
        </Button>
        <Button type="button" variant="secondary" className="oh-sapl-btn--danger" disabled={submitting} onClick={onDelete}>
          حذف
        </Button>
      </footer>
    </article>
  );
}
