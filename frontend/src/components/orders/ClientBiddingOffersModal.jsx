import { useCallback, useEffect, useState } from "react";
import {
  acceptClientOrderBidRequest,
  listClientOrderBidsRequest,
  rejectClientOrderBidRequest,
} from "../../services/api";
import { JodMoneyDisplay } from "../money/JodMoneyDisplay";
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
      setError(e?.response?.data?.message || e?.message || t(`${b}.loadError`));
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
      setError(e?.response?.data?.message || e?.message || t(`${b}.acceptError`));
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
      setError(e?.response?.data?.message || e?.message || t(`${b}.rejectError`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="presentation"
      onMouseDown={() => {
        if (!busy) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(15, 23, 42, 0.45)",
      }}
    >
      <div
        className="card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bids-modal-title"
        onMouseDown={(ev) => ev.stopPropagation()}
        style={{ maxWidth: 540, width: "100%", maxHeight: "90vh", overflow: "auto" }}
      >
        <h2 id="bids-modal-title" style={{ marginTop: 0 }}>
          {t(`${b}.title`)}
        </h2>
        <p className="help" style={{ marginTop: 0 }}>
          {t(`${b}.allowedRange`)}{" "}
          {order?.bidBudgetMin != null && order?.bidBudgetMax != null ? (
            <JodMoneyDisplay amount={order.bidBudgetMin} amountMax={order.bidBudgetMax} compact />
          ) : (
            "—"
          )}
        </p>
        <p className="help" style={{ marginTop: 0 }}>
          {t(`${b}.paymentHint`)}
        </p>
        {error ? (
          <p className="help" style={{ color: "#b91c1c", marginTop: 8 }}>
            {error}
          </p>
        ) : null}
        {loading ? (
          <p className="help">{t("clientArea.common.loading")}</p>
        ) : !openPool ? (
          <p className="help">{t(`${b}.notAvailable`)}</p>
        ) : bids.length === 0 ? (
          <p className="help">{t(`${b}.empty`)}</p>
        ) : (
          <ul className="oh-claims-list" style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
            {bids.map((bid) => (
              <li
                key={bid.id}
                className="card"
                style={{
                  marginBottom: 10,
                  padding: "12px 14px",
                  border: "1px solid rgba(15, 23, 42, 0.08)",
                }}
              >
                <div style={{ fontWeight: 800, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span>{applicantDisplayName(bid)}</span>
                  {bid.isPriority ? (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: "rgba(14, 116, 144, 0.12)",
                        color: "#0e7490",
                      }}
                    >
                      {t(`${b}.priorityBid`)}
                    </span>
                  ) : null}
                </div>
                <div style={{ marginTop: 8, fontWeight: 700 }}>
                  {t(`${b}.bidAmount`)} <JodMoneyDisplay amount={bid.amount} compact />
                </div>
                {confirmBidId === bid.id ? (
                  <div className="help" style={{ marginTop: 8 }}>
                    {t(`${b}.payNowHint`)}
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => reject(bid.id)}>
                    {t(`${b}.rejectBid`)}
                  </button>
                  {confirmBidId === bid.id ? (
                    <>
                      <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirmBidId(null)}>
                        {t("clientArea.common.cancel")}
                      </button>
                      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => accept(bid.id)}>
                        {t(`${b}.confirmAndPay`)}
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setConfirmBidId(bid.id)}>
                      {t(`${b}.selectBidAndPay`)}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            {t("clientArea.common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
