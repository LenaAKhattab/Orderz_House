import { useTranslation } from "../../../i18n/LanguageProvider";
import "../../../i18n/smartOrdersResources";
import ServiceFormSnapshotView from "./ServiceFormSnapshotView";

/**
 * S5 multi-service orders: read-only list of the additional service items (same snapshot shape as
 * `serviceForm`). Never shows prices — this view is used on client and freelancer screens too.
 */
export default function ServiceItemsSnapshotView({ items }) {
  const { t } = useTranslation();
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) return null;
  return (
    <div className="smart-service-items" data-testid="service-items-snapshot">
      {list.map((it, i) => (
        <ServiceFormSnapshotView
          key={`${it.itemNo ?? i}-${it.serviceCode || ""}`}
          serviceForm={it}
          title={t("smartOrders.finance.items.itemTitle", { no: it.itemNo ?? i + 2 })}
        />
      ))}
    </div>
  );
}
