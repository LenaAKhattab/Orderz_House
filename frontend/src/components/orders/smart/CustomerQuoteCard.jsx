import { useState } from "react";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "../../../i18n/smartOrdersResources";
import "../../../styles/smartOrders.css";
import { formatLocaleDate } from "../../../i18n/formatLocale";
import { useToast } from "../../ui/toastContext";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import { clientAcceptQuoteRequest, clientQuoteCheckoutRequest } from "../../../services/api";

/**
 * Customer view of their own quote (registered customers) or the guest page body. Shows only customer-facing
 * lines — never freelancer pay or margins. Payment status always comes from the server.
 */
export function QuoteSummary({ quote }) {
  const { t, locale } = useTranslation();
  const k = (key, v) => t(`smartOrders.customerQuote.${key}`, v);
  if (!quote) return null;
  return (
    <div className="smart-quote" data-testid="customer-quote" data-status={quote.status} data-payment={quote.paymentStatus}>
      <div className="smart-quote__head">
        <strong>{k("heading")}</strong>
        <span className="help">{k("version", { version: quote.version })}</span>
      </div>
      <dl className="smart-quote__lines">
        <div>
          <dt>{t("smartOrders.commercial.quote.base")}</dt>
          <dd dir="ltr">
            {quote.baseAmount} {quote.currency}
          </dd>
        </div>
        {(quote.adjustments || []).map((a, i) => (
          <div key={i}>
            <dt dir="auto">{a.label}</dt>
            <dd dir="ltr">
              {a.amount} {quote.currency}
            </dd>
          </div>
        ))}
        <div className="smart-quote__total">
          <dt>{t("smartOrders.commercial.quote.total")}</dt>
          <dd dir="ltr" data-testid="customer-quote-total">
            {quote.totalAmount} {quote.currency}
          </dd>
        </div>
      </dl>
      {quote.taxTreatment === "not_applicable" ? <p className="help">{k("taxNote")}</p> : null}
      {quote.termsNote ? (
        <p className="help" dir="auto">
          {quote.termsNote}
        </p>
      ) : null}
      {quote.status !== "expired" && quote.paymentStatus === "unpaid" ? (
        <p className="help">{k("validUntil", { date: formatLocaleDate(quote.expiresAt, locale) })}</p>
      ) : null}
      {quote.status === "expired" ? <p className="oh-inline-alert">{k("expired")}</p> : null}
      {quote.paymentStatus === "paid" ? <span className="oh-badge oh-badge--success">{k("paid")}</span> : null}
    </div>
  );
}

export default function CustomerQuoteCard({ orderId, quote, onChanged }) {
  const { t } = useTranslation();
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  if (!quote) return null;
  const act = async (fn) => {
    setBusy(true);
    try {
      const res = await fn();
      const url = res?.data?.checkoutUrl;
      if (url) {
        window.location.assign(url);
        return;
      }
      onChanged?.();
    } catch (e) {
      push({ type: "error", title: t("smartOrders.commercial.failed"), message: getSafeApiErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <QuoteSummary quote={quote} />
      <div className="smart-msg__actions">
        {quote.canAccept ? (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => act(() => clientAcceptQuoteRequest(orderId))} data-testid="customer-quote-accept">
            {t("smartOrders.customerQuote.accept")}
          </button>
        ) : null}
        {quote.canPay ? (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(() => clientQuoteCheckoutRequest(orderId))} data-testid="customer-quote-pay">
            {t("smartOrders.customerQuote.pay")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
