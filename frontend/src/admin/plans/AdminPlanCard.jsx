import { Trash2 } from "lucide-react";
import PlanStatusBadge from "./PlanStatusBadge";
import PlanToggle from "./PlanToggle";
import { formatOrderValueRange, formatPriceJod, buildPlanBenefits } from "./planDisplayUtils";

/**
 * @param {{
 *   plan: Record<string, unknown>;
 *   submitting: boolean;
 *   onActiveChange: (plan: Record<string, unknown>, nextActive: boolean) => void;
 *   onEdit: () => void;
 *   onDelete: () => void;
 *   showOrderControls?: boolean;
 *   canMoveUp?: boolean;
 *   canMoveDown?: boolean;
 *   reorderBusy?: boolean;
 *   onMoveUp?: () => void;
 *   onMoveDown?: () => void;
 * }} p
 */
export default function AdminPlanCard({
  plan,
  submitting,
  onActiveChange,
  onEdit,
  onDelete,
  showOrderControls = false,
  canMoveUp = false,
  canMoveDown = false,
  reorderBusy = false,
  onMoveUp,
  onMoveDown,
}) {
  const priceLabel = formatPriceJod(plan.priceJod);
  const orderRange = formatOrderValueRange(plan.orderValueMinJod, plan.orderValueMaxJod);
  const benefits = buildPlanBenefits(plan);

  return (
    <article className={`oh-sapl-card${plan.isActive ? "" : " oh-sapl-card--inactive"}`}>
      <header className="oh-sapl-card__header">
        <div className="oh-sapl-card__header-main">
          <div className="oh-sapl-card__title-row">
            <h3 className="oh-sapl-card__title">{plan.title}</h3>
          </div>
          <div className="oh-sapl-card__status-row">
            <PlanStatusBadge variant={plan.isActive ? "active" : "inactive"} />
            {plan.isVisible ? <PlanStatusBadge variant="visible" /> : <PlanStatusBadge variant="hidden" />}
          </div>
        </div>
        <div className="oh-sapl-card__header-toggle">
          <span className="oh-sapl-card__active-label">تشغيل</span>
          <PlanToggle
            compact
            ariaLabel={`${plan.isActive ? "تعطيل" : "تفعيل"} الباقة «${plan.title}»`}
            checked={Boolean(plan.isActive)}
            disabled={submitting || reorderBusy}
            onChange={(next) => onActiveChange(plan, next)}
          />
        </div>
      </header>

      <div className="oh-sapl-card__body">
        <p className="oh-sapl-card__price">{priceLabel ?? "مجانية"}</p>

        <div className="oh-sapl-card__meta-row">
          <span>{plan.durationDays} يوم</span>
        </div>

        {orderRange ? (
          <div className="oh-sapl-card__order-range">
            <span className="oh-sapl-card__order-range-label">نطاق الطلبات</span>
            <strong className="oh-sapl-card__order-range-value">{orderRange}</strong>
          </div>
        ) : null}

        {benefits.length > 0 ? (
          <ul className="oh-sapl-card__benefits" aria-label="مزايا الباقة">
            {benefits.map((row) => (
              <li key={row.id} className={`oh-sapl-card__benefit oh-sapl-card__benefit--${row.kind}`}>
                <span className="oh-sapl-card__benefit-icon" aria-hidden>
                  {row.icon}
                </span>
                <span className="oh-sapl-card__benefit-text">{row.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="oh-sapl-card__features-empty">لا توجد مزايا مسجّلة لهذه الباقة</p>
        )}
      </div>

      <footer className={`oh-sapl-card__footer${showOrderControls ? " oh-sapl-card__footer--reorderable" : ""}`}>
        {showOrderControls ? (
          <button
            type="button"
            className="oh-sapl-card__reorder-btn oh-sapl-card__reorder-btn--up"
            title="رفع الباقة"
            aria-label="رفع الباقة"
            disabled={submitting || reorderBusy || !canMoveUp}
            onClick={() => onMoveUp?.()}
          >
            ↑
          </button>
        ) : null}
        <div className="oh-sapl-card__footer-actions">
          <button
            type="button"
            className="oh-sapl-card__action oh-sapl-card__action--primary"
            disabled={submitting || reorderBusy}
            onClick={onEdit}
          >
            تعديل
          </button>
          <button
            type="button"
            className="oh-sapl-card__action oh-sapl-card__action--danger oh-sapl-card__action--icon"
            disabled={submitting || reorderBusy}
            onClick={onDelete}
            title="تعطيل الباقة"
            aria-label={`تعطيل الباقة «${plan.title}»`}
            data-testid="plan-card-delete"
          >
            <Trash2 size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>
        {showOrderControls ? (
          <button
            type="button"
            className="oh-sapl-card__reorder-btn oh-sapl-card__reorder-btn--down"
            title="خفض الباقة"
            aria-label="خفض الباقة"
            disabled={submitting || reorderBusy || !canMoveDown}
            onClick={() => onMoveDown?.()}
          >
            ↓
          </button>
        ) : null}
      </footer>
    </article>
  );
}
