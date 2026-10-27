import { useRef, useState } from "react";
import { createClientFixedOrderCheckoutRequest, selectClientOrderBidRequest } from "../../services/api";
import { useToast } from "../ui/toastContext";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import {
  isClientFixedOrderAwaitingStripeCheckout,
  isClientOrderAwaitingSelectedBidPayment,
} from "../../utils/clientFixedOrderPayNow";
import { useTranslation } from "../../i18n/LanguageProvider";
import { usePageRestore } from "../../hooks/usePageRestore";
import "../../i18n/clientAreaResources";

/** Server codes with localized copy (server messages are Arabic-only). */
const PAY_ERROR_KEYS = {
  CLIENT_ORDER_PAYMENT_PROCESSING: "processing",
  CLIENT_ORDER_PAYMENT_STATUS_UNAVAILABLE: "statusUnavailable",
  CLIENT_ORDER_PAYMENT_REVIEW_REQUIRED: "reviewRequired",
  PAYMENT_PROVIDER_ERROR: "providerError",
};

/**
 * «Continue payment» for an unpaid client order — a fixed-price order awaiting payment, or a priced-bidding
 * order whose selected offer awaits payment. The server resumes the SAME open Stripe Checkout Session (or
 * opens a fresh one for the same order / offer if it expired) — nothing is recreated.
 */
export default function ClientFixedOrderPayNowButton({ order, className = "btn btn-primary", onChanged }) {
  const { push } = useToast();
  const { t } = useTranslation();
  const p = "clientArea.payNow";
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  // Browser Back from Stripe restores this page from BFCache with the button still "redirecting".
  usePageRestore((reason) => {
    if (reason !== "pageshow") return;
    inFlight.current = false;
    setBusy(false);
  });

  const fixed = isClientFixedOrderAwaitingStripeCheckout(order);
  const selectedBid = !fixed && isClientOrderAwaitingSelectedBidPayment(order);
  if (!fixed && !selectedBid) return null;

  const onPay = async () => {
    if (inFlight.current || busy || !order?.id) return;
    inFlight.current = true;
    setBusy(true);
    let redirecting = false;
    try {
      const res = fixed
        ? await createClientFixedOrderCheckoutRequest(order.id)
        : await selectClientOrderBidRequest(order.id, order.selectedBidId);
      const data = res?.data || res || {};
      if (data.alreadyPaid) {
        push({ type: "success", title: t(`${p}.paidTitle`), message: t(fixed ? `${p}.paidMessage` : `${p}.bidPaidMessage`) });
        onChanged?.();
        return;
      }
      if (!data.checkoutUrl) {
        push({ type: "error", title: t(`${p}.startErrorTitle`), message: t(`${p}.noCheckoutUrl`) });
        return;
      }
      redirecting = true;
      window.location.href = data.checkoutUrl;
    } catch (e) {
      const key = PAY_ERROR_KEYS[e?.response?.data?.code];
      push({
        type: key === "processing" ? "info" : "error",
        title: t(`${p}.startErrorTitle`),
        message: key ? t(`${p}.${key}`) : getSafeApiErrorMessage(e, t(`${p}.openCheckoutFallback`)),
      });
      if (key === "processing") onChanged?.();
    } finally {
      // Keep the busy state while the browser navigates to Stripe (no second click).
      if (!redirecting) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  };

  return (
    <button type="button" className={className} disabled={busy} onClick={() => void onPay()}>
      {busy ? t("clientArea.common.busy.redirecting") : t(`${p}.continueLabel`)}
    </button>
  );
}
