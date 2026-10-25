import { useCallback, useEffect, useState } from "react";
import {
  acceptClientOrderBidRequest,
  listClientOrderBidsRequest,
  rejectClientOrderBidRequest,
} from "../../services/api";
import { Users } from "lucide-react";
import { JodMoneyDisplay } from "../money/JodMoneyDisplay";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import OrderDialog from "./OrderDialog";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/clientAreaResources";

function applicantDisplayName(row) {
  if (row?.displayName) return row.displayName;
  const f = row?.freelancer;
  if (!f) return "—";
  const parts = [f.firstName, f.fatherName, f.familyName].filter(Boolean);
  return parts.length ? parts.join(" ") : "—";
}

export default function ClientBiddingOffersModal({ open, orderId, order, onClose, onChanged }) {
  const { t } = useTranslation();
  const b = "clientArea.biddingOffers";
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bids, setBids] = useState([]);
  const [openPool, setOpenPool] = useState(false);
  const [error, setError] = useState("");
  const [confirmBidId, setConfirmBidId] = useState(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError("");
    try {
      const res = await listClientOrderBidsRequest(orderId);
      const payload = res?.data ?? res;
      setBids(Array.isArray(payload?.bids) ? payload.bids : []);
      setOpenPool(Boolean(payload?.orderSummary?.hasOpenPool));
    } catch (e) {
      setError(getSafeApiErrorMessage(e, t(`${b}.loadError`)));
      setBids([]);
      setOpenPool(false);
    } finally {
      setLoading(false);
    }
  }, [orderId, t]);

  useEffect(() => {
    if (open && orderId) load();
  }, [open, orderId, load]);

  if (!open) return null;

  const accept = async (bidId) => {
    setBusy(true);
    setError("");
    try {
      const res = await acceptClientOrderBidRequest(orderId, bidId);
      const checkoutUrl = res?.data?.checkoutUrl || res?.checkoutUrl;
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }
      setError(t(`${b}.checkoutSessionError`));
    } catch (e) {
      setError(getSafeApiErrorMessage(e, t(`${b}.acceptError`)));
    } finally {
      setBusy(false);
    }
  };

  const reject = async (bidId) => {
    setBusy(true);
    setError("");
    try {
      await rejectClientOrderBidRequest(orderId, bidId);
      await load();
      onChanged?.();
    } catch (e) {
      setError(getSafeApiErrorMessage(e, t(`${b}.rejectError`)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OrderDialog
      open={open}
      onClose={onClose}
      busy={busy}
      size="md"
      icon={<Users />}
      title={t(`${b}.title`)}
      subtitle={order?.title ? <span dir="auto">{order.title}</span> : null}
      footer={
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
          {t("clientArea.common.close")}
        </button>
      }
    >
      <div className="oh-bids-summary">
        <span className="oh-bids-summary__label">{t(`${b}.allowedRange`)}</span>
        <strong className="oh-bids-summary__value">
          {order?.bidBudgetMin != null && order?.bidBudgetMax != null ? (
            <JodMoneyDisplay amount={order.bidBudgetMin} amountMax={order.bidBudgetMax} compact />
          ) : (
            "—"
          )}
        </strong>
      </div>
      <p className="oh-dialog-note">{t(`${b}.paymentHint`)}</p>
      {error ? (
        <p className="oh-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="oh-dialog-field__hint" role="status">
          {t("clientArea.common.loading")}
        </p>
      ) : !openPool ? (
        <p className="oh-dialog-field__hint">{t(`${b}.notAvailable`)}</p>
      ) : bids.length === 0 ? (
        <p className="oh-dialog-field__hint">{t(`${b}.empty`)}</p>
      ) : (
        <ul className="oh-bids-list">
          {bids.map((bid) => (
            <li key={bid.id} className={`oh-bid${confirmBidId === bid.id ? " is-confirming" : ""}`}>
              <div className="oh-bid__head">
                <span className="oh-bid__name">{applicantDisplayName(bid)}</span>
                {bid.isPriority ? <span className="oh-bid__chip">{t(`${b}.priorityBid`)}</span> : null}
                <strong className="oh-bid__amount">
                  <JodMoneyDisplay amount={bid.amount} compact />
                </strong>
              </div>
              {bid.message ? (
                <p className="oh-bid__message" dir="auto">
                  {bid.message}
                </p>
              ) : null}
              {confirmBidId === bid.id ? <p className="oh-bid__confirm-hint">{t(`${b}.payNowHint`)}</p> : null}
              <div className="oh-bid__actions">
                {confirmBidId === bid.id ? (
                  <>
                    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirmBidId(null)}>
                      {t("clientArea.common.cancel")}
                    </button>
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => accept(bid.id)}>
                      {busy ? t("clientArea.common.busy.redirecting") : t(`${b}.confirmAndPay`)}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="oh-bid__reject" disabled={busy} onClick={() => reject(bid.id)}>
                      {t(`${b}.rejectBid`)}
                    </button>
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setConfirmBidId(bid.id)}>
                      {t(`${b}.selectBidAndPay`)}
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </OrderDialog>
  );
}
