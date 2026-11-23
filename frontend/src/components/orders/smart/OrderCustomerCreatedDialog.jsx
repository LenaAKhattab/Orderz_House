import DashboardModal from "../../dashboard/DashboardModal";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "../../../i18n/smartOrdersResources";
import { formatLocaleDateTime } from "../../../i18n/formatLocale";
import CustomerWhatsappMessage from "./CustomerWhatsappMessage";

/**
 * Shown once after an Admin creates a customer order. The one-time activation link exists only in
 * this response (the server stores its hash), so it is displayed here with copy helpers.
 */
export default function OrderCustomerCreatedDialog({ result, onClose }) {
  const { t, locale } = useTranslation();
  const customer = result?.customer || null;
  const link = result?.customerLink || null;
  const open = Boolean(customer);
  if (!open) return null;
  const orderCode = customer.orderCode;
  const body =
    customer.mode === "guest"
      ? t("smartOrders.created.guestBody", { orderCode })
      : customer.mode === "new_account"
        ? t("smartOrders.created.accountBody", { orderCode })
        : t("smartOrders.created.existingBody", { orderCode });

  return (
    <DashboardModal
      open={open}
      title={t("smartOrders.created.title")}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          {t("smartOrders.created.close")}
        </button>
      }
    >
      <div data-testid="smart-orders-created-dialog">
        <p style={{ marginTop: 0 }}>{body}</p>
        {link ? (
          <div className="field">
            <span className="label">{t("smartOrders.created.linkLabel")}</span>
            <input className="input" dir="ltr" readOnly value={link.claimUrl} data-testid="smart-orders-claim-link" />
            <div className="help">{t("smartOrders.created.linkExpires", { date: formatLocaleDateTime(link.expiresAt, locale) })}</div>
          </div>
        ) : null}
        {customer.mode === "guest" || customer.mode === "new_account" ? (
          <CustomerWhatsappMessage
            kind={customer.mode === "guest" ? "guest" : "account"}
            customer={customer}
            link={link?.claimUrl || null}
          />
        ) : null}
      </div>
    </DashboardModal>
  );
}
