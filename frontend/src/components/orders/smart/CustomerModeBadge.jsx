import { useTranslation } from "../../../i18n/LanguageProvider";
import "../../../i18n/smartOrdersResources";

/** Admin badge for an order's customer linkage (internal / account / pending activation / guest). */
export default function CustomerModeBadge({ summary }) {
  const { t } = useTranslation();
  const mode = summary?.mode || null;
  let key = "internal";
  let tone = "neutral";
  if (mode === "existing") {
    key = "existing";
    tone = "info";
  } else if (mode === "new_account") {
    key = summary.accountLinked ? "newAccountActive" : "newAccountPending";
    tone = summary.accountLinked ? "success" : "warning";
  } else if (mode === "guest") {
    key = summary.accountLinked ? "converted" : "guest";
    tone = summary.accountLinked ? "success" : "primary";
  }
  return (
    <span className={`oh-badge oh-badge--${tone}`} data-testid="smart-orders-mode-badge" data-mode={mode || "internal"}>
      {t(`smartOrders.badges.${key}`)}
    </span>
  );
}
