import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { CreditCard } from "lucide-react";
import { useTranslation } from "../i18n/LanguageProvider";
import "../i18n/smartOrdersResources";
import "../styles/smartOrders.css";
import { guestQuoteCheckoutRequest, guestQuoteViewRequest } from "../services/api";
import { getSafeApiErrorMessage } from "../utils/apiErrorMessage";
import { pickLocalized } from "../components/orders/smart/catalogForm";
import { QuoteSummary } from "../components/orders/smart/CustomerQuoteCard";

const TOKEN_KEY = "orderzhouse.guestQuoteToken";

/**
 * Smart Orders S3 — guest quote & payment page. No account, no login: the one-time token lives in the URL
 * fragment (never sent to servers) and in sessionStorage for the Stripe round trip. Payment status shown here
 * always comes from the backend (webhook truth) — the success return alone never claims "paid".
 */
export default function GuestQuotePage() {
  const { t, dir, locale } = useTranslation();
  const location = useLocation();
  const [token, setToken] = useState(null);
  const [quote, setQuote] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | invalid
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ret = new URLSearchParams(location.search).get("r");
  const firstLoad = useRef(true);
  const k = (key, v) => t(`smartOrders.guestPay.${key}`, v);

  const refresh = useCallback(async (tk, event = null) => {
    try {
      const res = await guestQuoteViewRequest(tk, event);
      setQuote(res?.data?.quote || null);
      setState("ready");
    } catch {
      setState("invalid");
    }
  }, []);

  useEffect(() => {
    const m = /(?:^#|&)t=([A-Za-z0-9_-]{43})(?:&|$)/.exec(location.hash || "");
    let tk = m ? m[1] : null;
    try {
      if (tk) sessionStorage.setItem(TOKEN_KEY, tk);
      else tk = sessionStorage.getItem(TOKEN_KEY);
    } catch {
      /* storage unavailable */
    }
    if (m) window.history.replaceState(null, "", `${location.pathname}${location.search}`);
    if (!tk || !/^[A-Za-z0-9_-]{43}$/.test(tk)) {
      setState("invalid");
      return;
    }
    setToken(tk);
    const event = firstLoad.current && ret === "success" ? "checkout_success_returned" : firstLoad.current && ret === "cancel" ? "checkout_cancel_returned" : null;
    firstLoad.current = false;
    void refresh(tk, event);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read the fragment once
  }, []);

  // After a success return, poll gently (max ~1 min) until the webhook confirms the payment.
  useEffect(() => {
    if (!token || ret !== "success" || !quote || quote.paymentStatus === "paid") return undefined;
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      void refresh(token);
      if (n >= 12) window.clearInterval(id);
    }, 5000);
    return () => window.clearInterval(id);
  }, [token, ret, quote, refresh]);

  const pay = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await guestQuoteCheckoutRequest(token);
      const url = res?.data?.checkoutUrl;
      if (url) {
        void guestQuoteViewRequest(token, "checkout_redirect_started").catch(() => {});
        window.location.assign(url);
        return;
      }
    } catch (e) {
      setError(getSafeApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const service = quote?.service ? pickLocalized(quote.service.name || {}, locale) : null;

  return (
    <main className="claim-order-page" dir={dir} data-testid="guest-quote-page">
      <section className="claim-order-card">
        <div className="claim-order-card__icon" aria-hidden="true">
          <CreditCard size={36} />
        </div>
        <h1>{k("title")}</h1>
        {state === "loading" ? <p className="help">{k("loading")}</p> : null}
        {state === "invalid" ? (
          <p className="oh-inline-alert" role="alert" data-testid="guest-quote-invalid">
            {k("invalid")}
          </p>
        ) : null}
        {state === "ready" && quote ? (
          <>
            <dl className="claim-order-card__facts">
              {quote.orderCode ? (
                <div>
                  <dt>{k("order")}</dt>
                  <dd dir="ltr">{quote.orderCode}</dd>
                </div>
              ) : null}
              {service ? (
                <div>
                  <dt>{k("service")}</dt>
                  <dd>{service}</dd>
                </div>
              ) : null}
            </dl>
            <QuoteSummary quote={quote} />
            {quote.paymentStatus === "paid" ? (
              <p role="status" data-testid="guest-quote-confirmed">
                {k("confirmed")}
              </p>
            ) : ret === "success" ? (
              <p role="status" data-testid="guest-quote-pending">
                {k("successPending")}
              </p>
            ) : ret === "cancel" ? (
              <p className="oh-inline-alert" role="status" data-testid="guest-quote-cancelled">
                {k("cancelled")}
              </p>
            ) : null}
            {quote.canPay ? (
              <>
                <p className="help">{k("noAccount")}</p>
                <button type="button" className="btn btn-primary" onClick={pay} disabled={busy} data-testid="guest-quote-pay">
                  {t("smartOrders.customerQuote.pay")}
                </button>
              </>
            ) : null}
            {ret === "success" && quote.paymentStatus !== "paid" ? (
              <button type="button" className="btn btn-secondary" onClick={() => refresh(token)}>
                {k("refresh")}
              </button>
            ) : null}
            {error ? (
              <p className="oh-inline-alert" role="alert">
                {error}
              </p>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
