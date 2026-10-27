import { useState } from "react";
import { cancelClientFixedOrderPaymentRequest } from "../../services/api";
import { useToast } from "../ui/toastContext";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import { isClientFixedOrderAwaitingStripeCheckout } from "../../utils/clientFixedOrderPayNow";
import { useTranslation } from "../../i18n/LanguageProvider";
import ConfirmDialog from "../dashboard/ConfirmDialog";
import "../../i18n/clientAreaResources";

const CANCEL_ERROR_KEYS = {
  CLIENT_ORDER_ALREADY_PAID: "alreadyPaid",
  CLIENT_ORDER_PAYMENT_PROCESSING: "processing",
  CLIENT_ORDER_PAYMENT_STATUS_UNAVAILABLE: "statusUnavailable",
};

/**
 * Explicit «Cancel order» for an unpaid fixed-price order (the client's decision — never automatic on a
 * Stripe return). The server expires the Stripe Session first and refuses if the order was paid.
 */
export default function ClientFixedOrderCancelButton({ order, className = "btn btn-secondary", onChanged }) {
  const { push } = useToast();
  const { t } = useTranslation();
  const p = "clientArea.payNow";
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!isClientFixedOrderAwaitingStripeCheckout(order)) return null;

  const confirmCancel = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await cancelClientFixedOrderPaymentRequest(order.id);
      push({ type: "success", title: t(`${p}.cancelDoneTitle`), message: t(`${p}.cancelDoneMessage`) });
      setOpen(false);
      onChanged?.();
    } catch (e) {
      const key = CANCEL_ERROR_KEYS[e?.response?.data?.code];
      push({
        type: "error",
        title: t(`${p}.cancelErrorTitle`),
        message: key ? t(`${p}.${key}`) : getSafeApiErrorMessage(e, t(`${p}.cancelErrorTitle`)),
      });
      setOpen(false);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={className} disabled={busy} onClick={() => setOpen(true)}>
        {t(`${p}.cancelLabel`)}
      </button>
      <ConfirmDialog
        open={open}
        title={t(`${p}.cancelConfirmTitle`)}
        body={t(`${p}.cancelConfirmBody`)}
        confirmLabel={busy ? t("clientArea.common.busy.sending") : t(`${p}.cancelConfirm`)}
        cancelLabel={t("clientArea.common.cancel")}
        confirmBusy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={() => void confirmCancel()}
      />
    </>
  );
}
