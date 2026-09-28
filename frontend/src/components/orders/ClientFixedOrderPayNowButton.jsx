import { useRef, useState } from "react";
import { createClientFixedOrderCheckoutRequest } from "../../services/api";
import { useToast } from "../ui/toastContext";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import { isClientFixedOrderAwaitingStripeCheckout } from "../../utils/clientFixedOrderPayNow";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/clientAreaResources";

export default function ClientFixedOrderPayNowButton({ order, className = "btn btn-primary" }) {
  const { push } = useToast();
  const { t } = useTranslation();
  const p = "clientArea.payNow";
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  if (!isClientFixedOrderAwaitingStripeCheckout(order)) return null;

  const onPay = async () => {
    if (inFlight.current || busy || !order?.id) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const res = await createClientFixedOrderCheckoutRequest(order.id);
      const checkoutUrl = res?.data?.checkoutUrl || res?.checkoutUrl;
      if (!checkoutUrl) {
        push({ type: "error", title: t(`${p}.startErrorTitle`), message: t(`${p}.noCheckoutUrl`) });
        return;
      }
      window.location.href = checkoutUrl;
    } catch (e) {
      push({
        type: "error",
        title: t(`${p}.startErrorTitle`),
        message: getSafeApiErrorMessage(e, t(`${p}.openCheckoutFallback`)),
      });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <button type="button" className={className} disabled={busy} onClick={() => void onPay()}>
      {busy ? t("clientArea.common.busy.redirecting") : t(`${p}.label`)}
    </button>
  );
}
