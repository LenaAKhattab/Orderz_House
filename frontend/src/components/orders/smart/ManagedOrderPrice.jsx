import { useTranslation } from "../../../i18n/LanguageProvider";
import "../../../i18n/smartOrdersResources";

/**
 * Customer price of an Admin-managed order, shown in its own currency (JOD or AED) — never converted
 * and never the freelancer budget.
 */
export default function ManagedOrderPrice({ order }) {
  const { t } = useTranslation();
  if (order?.customerPricingStatus === "priced" && order?.budget != null && order?.currencyCode) {
    return (
      <span dir="ltr" data-testid="managed-order-price">
        {Number(order.budget).toFixed(2)} {order.currencyCode}
      </span>
    );
  }
  return <span data-testid="managed-order-price">{t("smartOrders.managed.pricePending")}</span>;
}

export function ManagedOrderBadge() {
  const { t } = useTranslation();
  return (
    <span className="oh-badge oh-badge--info" data-testid="managed-order-badge">
      {t("smartOrders.managed.badge")}
    </span>
  );
}

export function ManagedOrderNotice() {
  const { t } = useTranslation();
  return (
    <div className="od-notice oh-order-details__notice" role="status" data-testid="managed-order-notice">
      <p>
        <strong>{t("smartOrders.managed.badge")}</strong> — {t("smartOrders.managed.readOnlyNote")}
      </p>
    </div>
  );
}
