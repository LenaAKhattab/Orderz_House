import { Trash2 } from "lucide-react";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/planAdminResources";
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
  const { t } = useTranslation();
  const priceLabel = formatPriceJod(plan.priceJod);
  const orderRange = formatOrderValueRange(plan.orderValueMinJod, plan.orderValueMaxJod);
  const benefits = buildPlanBenefits(plan);
  const toggleAction = plan.isActive ? t("planAdmin.card.disable") : t("planAdmin.card.enable");

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
          <span className="oh-sapl-card__active-label">{t("planAdmin.card.activeLabel")}</span>
          <PlanToggle
            compact
            ariaLabel={t("planAdmin.card.toggleAria", { action: toggleAction, title: plan.title })}
            checked={Boolean(plan.isActive)}
            disabled={submitting || reorderBusy}
            onChange={(next) => onActiveChange(plan, next)}
          />
        </div>
      </header>

      <div className="oh-sapl-card__body">
        <p className="oh-sapl-card__price">{priceLabel ?? t("planAdmin.common.free")}</p>

        <div className="oh-sapl-card__meta-row">
          <span>
            {plan.durationDays} {t("planAdmin.common.days")}
          </span>
        </div>

        {orderRange ? (
          <div className="oh-sapl-card__order-range">
            <span className="oh-sapl-card__order-range-label">{t("planAdmin.card.orderRange")}</span>
            <strong className="oh-sapl-card__order-range-value">{orderRange}</strong>
          </div>
        ) : null}

        {benefits.length > 0 ? (
          <ul className="oh-sapl-card__benefits" aria-label={t("planAdmin.card.benefitsAria")}>
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
          <p className="oh-sapl-card__features-empty">{t("planAdmin.card.noBenefits")}</p>
        )}
      </div>

      <footer className={`oh-sapl-card__footer${showOrderControls ? " oh-sapl-card__footer--reorderable" : ""}`}>
        {showOrderControls ? (
          <button
            type="button"
            className="oh-sapl-card__reorder-btn oh-sapl-card__reorder-btn--up"
            title={t("planAdmin.card.moveUp")}
            aria-label={t("planAdmin.card.moveUp")}
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
            {t("planAdmin.card.edit")}
          </button>
          <button
            type="button"
            className="oh-sapl-card__action oh-sapl-card__action--danger oh-sapl-card__action--icon"
            disabled={submitting || reorderBusy}
            onClick={onDelete}
            title={t("planAdmin.card.deactivate")}
            aria-label={t("planAdmin.card.toggleAria", {
              action: t("planAdmin.card.deactivate"),
              title: plan.title,
            })}
            data-testid="plan-card-delete"
          >
            <Trash2 size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>
        {showOrderControls ? (
          <button
            type="button"
            className="oh-sapl-card__reorder-btn oh-sapl-card__reorder-btn--down"
            title={t("planAdmin.card.moveDown")}
            aria-label={t("planAdmin.card.moveDown")}
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
