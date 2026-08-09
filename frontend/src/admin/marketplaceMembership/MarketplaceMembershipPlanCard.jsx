import StatusBadge from "../../components/dashboard/StatusBadge";
import Button from "../../components/ui/Button";
import { formatMarketplaceAccessLabel, formatMarketplacePriceLabel } from "./marketplacePlanFormUtils";

/**
 * Admin card for Marketplace Membership plans (independent of legacy plan cards).
 */
export default function MarketplaceMembershipPlanCard({
  plan,
  isEn = false,
  reordering = false,
  canMoveUp = false,
  canMoveDown = false,
  onEdit,
  onToggleActive,
  onMove,
  busy = false,
}) {
  if (!plan) return null;

  const title = isEn ? plan.nameEn || plan.nameAr : plan.nameAr || plan.nameEn;
  const priceLabel = formatMarketplacePriceLabel(plan, isEn);
  const accessLabel = formatMarketplaceAccessLabel(plan, isEn);
  const saleOn = Boolean(plan.sale?.enabled);

  return (
    <article className={`oh-mmp-card${plan.isActive ? "" : " oh-mmp-card--inactive"}`}>
      <header className="oh-mmp-card__header">
        <div className="oh-mmp-card__titles">
          <h3 className="oh-mmp-card__title">{title}</h3>
          <p className="oh-mmp-card__tier" title="tier_code">
            {plan.tierCode}
          </p>
        </div>
        <div className="oh-mmp-card__badges">
          <StatusBadge tone={plan.isActive ? "success" : "neutral"}>
            {plan.isActive ? (isEn ? "Active" : "ظاهرة") : isEn ? "Hidden" : "مخفية"}
          </StatusBadge>
          {plan.eliteDirectOrdersEnabled ? (
            <StatusBadge tone="info">{isEn ? "Elite Direct" : "طلب مباشر"}</StatusBadge>
          ) : null}
          {saleOn ? <StatusBadge tone="warning">{isEn ? "Sale" : "تخفيض"}</StatusBadge> : null}
        </div>
      </header>

      <dl className="oh-mmp-card__meta">
        <div>
          <dt>{isEn ? "Monthly price" : "السعر الشهري"}</dt>
          <dd>
            {priceLabel}
            {saleOn && plan.sale?.originalPriceJod != null ? (
              <span className="oh-mmp-card__strike">
                {" "}
                {plan.sale.originalPriceJod} {isEn ? "JOD" : "د.أ"}
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>{isEn ? "Real-order access" : "وصول الطلبات الحقيقية"}</dt>
          <dd>{accessLabel}</dd>
        </div>
        <div>
          <dt>{isEn ? "Tokens / cycle" : "وحدات العمل / دورة"}</dt>
          <dd>{plan.includedTokensPerCycle ?? 0}</dd>
        </div>
        <div>
          <dt>{isEn ? "Cash" : "نقدي"}</dt>
          <dd>
            {plan.cashAllowed
              ? isEn
                ? `${plan.minimumCashMonths}–${plan.maximumPrepaidMonths} mo`
                : `${plan.minimumCashMonths}–${plan.maximumPrepaidMonths} شهر`
              : isEn
                ? "Not allowed"
                : "غير مسموح"}
          </dd>
        </div>
      </dl>

      <footer className="oh-mmp-card__actions">
        <div className="oh-mmp-card__reorder">
          <Button
            type="button"
            variant="secondary"
            disabled={!canMoveUp || reordering || busy}
            onClick={() => onMove?.(plan, "up")}
            aria-label={isEn ? "Move up" : "تحريك لأعلى"}
          >
            ↑
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!canMoveDown || reordering || busy}
            onClick={() => onMove?.(plan, "down")}
            aria-label={isEn ? "Move down" : "تحريك لأسفل"}
          >
            ↓
          </Button>
        </div>
        <div className="oh-mmp-card__primary-actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => onEdit?.(plan)}>
            {isEn ? "Edit" : "تعديل"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => onToggleActive?.(plan, !plan.isActive)}
          >
            {plan.isActive ? (isEn ? "Hide" : "إخفاء") : isEn ? "Show" : "إظهار"}
          </Button>
        </div>
      </footer>
    </article>
  );
}
