import StatusBadge from "../../components/dashboard/StatusBadge";
import Button from "../../components/ui/Button";
import { Trash2 } from "lucide-react";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/planAdminResources";
import { formatMarketplaceAccessLabel, formatMarketplacePriceLabel } from "./marketplacePlanFormUtils";

/**
 * Admin card for Marketplace Membership plans (independent of legacy plan cards).
 */
export default function MarketplaceMembershipPlanCard({
  plan,
  isEn: isEnProp = false,
  reordering = false,
  canMoveUp = false,
  canMoveDown = false,
  onEdit,
  onToggleActive,
  onArchive,
  onMove,
  busy = false,
}) {
  const { t, locale } = useTranslation();
  const isEn = isEnProp || locale === "en";
  if (!plan) return null;

  const title = isEn ? plan.nameEn || plan.nameAr : plan.nameAr || plan.nameEn;
  const priceLabel = formatMarketplacePriceLabel(plan, isEn, t);
  const accessLabel = formatMarketplaceAccessLabel(plan, isEn, t);
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
            {plan.isActive ? t("planAdmin.marketplace.cardActive") : t("planAdmin.marketplace.cardHidden")}
          </StatusBadge>
          {plan.eliteDirectOrdersEnabled ? (
            <StatusBadge tone="info">{t("planAdmin.marketplace.eliteDirectBadge")}</StatusBadge>
          ) : null}
          {plan.priorityBidEnabled ? (
            <StatusBadge tone="info">
              {t("planAdmin.marketplace.priorityUses", { count: plan.priorityBidUsesPerCycle ?? 0 })}
            </StatusBadge>
          ) : null}
          {saleOn ? <StatusBadge tone="warning">{t("planAdmin.marketplace.saleBadge")}</StatusBadge> : null}
        </div>
      </header>

      <dl className="oh-mmp-card__meta">
        <div>
          <dt>{t("planAdmin.marketplace.monthlyPriceLabel")}</dt>
          <dd>
            {priceLabel}
            {saleOn && plan.sale?.originalPriceJod != null ? (
              <span className="oh-mmp-card__strike">
                {" "}
                {plan.sale.originalPriceJod} {t("planAdmin.common.currencyJod")}
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>{t("planAdmin.marketplace.realAccess")}</dt>
          <dd>{accessLabel}</dd>
        </div>
        <div>
          <dt>{t("planAdmin.marketplace.bidsMonth")}</dt>
          <dd>{plan.monthlyBidAllowance ?? 0}</dd>
        </div>
        <div>
          <dt>{t("planAdmin.marketplace.articleLevel")}</dt>
          <dd>{plan.articleAccessLevel ?? 1}</dd>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <dt>{t("planAdmin.marketplace.accessMeaning")}</dt>
          <dd style={{ fontWeight: 400, fontSize: "0.9rem" }}>{t("planAdmin.marketplace.accessMeaningHint")}</dd>
        </div>
        <div>
          <dt>{t("planAdmin.marketplace.priorityCycle")}</dt>
          <dd>
            {plan.priorityBidEnabled ? plan.priorityBidUsesPerCycle ?? 0 : t("planAdmin.marketplace.disabled")}
          </dd>
        </div>
        <div>
          <dt>{t("planAdmin.marketplace.cash")}</dt>
          <dd>
            {plan.cashAllowed
              ? t("planAdmin.marketplace.cashMonths", {
                  min: plan.minimumCashMonths,
                  max: plan.maximumPrepaidMonths,
                })
              : t("planAdmin.marketplace.cashNotAllowed")}
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
            aria-label={t("planAdmin.card.moveUp")}
          >
            ↑
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!canMoveDown || reordering || busy}
            onClick={() => onMove?.(plan, "down")}
            aria-label={t("planAdmin.card.moveDown")}
          >
            ↓
          </Button>
        </div>
        <div className="oh-mmp-card__primary-actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => onEdit?.(plan)}>
            {t("planAdmin.card.edit")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => onToggleActive?.(plan, !plan.isActive)}
          >
            {plan.isActive ? t("planAdmin.marketplace.hide") : t("planAdmin.marketplace.show")}
          </Button>
          {plan.isActive ? (
            <button
              type="button"
              className="oh-mmp-card__icon-danger"
              disabled={busy}
              onClick={() => onArchive?.(plan)}
              title={t("planAdmin.card.deactivate")}
              aria-label={t("planAdmin.marketplace.deactivateAria", { title })}
              data-testid="marketplace-plan-card-delete"
            >
              <Trash2 size={16} strokeWidth={2} aria-hidden />
            </button>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
