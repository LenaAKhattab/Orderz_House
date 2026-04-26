import { useCallback, useEffect, useState } from "react";
import {
  acceptClientOrderBidRequest,
  listClientOrderBidsRequest,
  rejectClientOrderBidRequest,
} from "../../services/api";

function freelancerDisplayName(f) {
  if (!f) return "—";
  const parts = [f.firstName, f.fatherName, f.familyName].filter(Boolean);
  return parts.length ? parts.join(" ") : f.email || "—";
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ar-JO-u-nu-latn", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

export default function ClientBiddingOffersModal({ open, orderId, order, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bids, setBids] = useState([]);
  const [openPool, setOpenPool] = useState(false);
  const [currencyCode, setCurrencyCode] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError("");
    try {
      const res = await listClientOrderBidsRequest(orderId);
      const payload = res?.data ?? res;
      setBids(Array.isArray(payload?.bids) ? payload.bids : []);
      setOpenPool(Boolean(payload?.orderSummary?.hasOpenPool));
      setCurrencyCode(String(payload?.orderSummary?.currencyCode || order?.currencyCode || "").trim());
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "تعذّر تحميل العروض.");
      setBids([]);
      setOpenPool(false);
    } finally {
      setLoading(false);
    }
  }, [orderId, order?.currencyCode]);

  useEffect(() => {
    if (open && orderId) load();
  }, [open, orderId, load]);

  if (!open) return null;

  const rangeText =
    order?.bidBudgetMin != null && order?.bidBudgetMax != null
      ? `${formatMoney(order.bidBudgetMin)} – ${formatMoney(order.bidBudgetMax)}${currencyCode ? ` ${currencyCode}` : ""}`
      : "—";

  const accept = async (bidId) => {
    setBusy(true);
    setError("");
    try {
      await acceptClientOrderBidRequest(orderId, bidId);
      onChanged?.();
      onClose();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "تعذّر اعتماد العرض.");
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
      setError(e?.response?.data?.message || e?.message || "تعذّر رفض العرض.");
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
          عروض الأسعار من المستقلين
        </h2>
        <p className="help" style={{ marginTop: 0 }}>
          النطاق المسموح للعروض: <span dir="ltr" style={{ unicodeBidi: "plaintext" }}>{rangeText}</span>
        </p>
        <p className="help" style={{ marginTop: 0 }}>
          يمكنك اعتماد عرض واحد فقط لإسناد الطلب لهذا المستقل وإغلاق الحوض؛ سيتم رفض بقية العروض المعلّقة تلقائياً.
        </p>
        {error ? (
          <p className="help" style={{ color: "#b91c1c", marginTop: 8 }}>
            {error}
          </p>
        ) : null}
        {loading ? (
          <p className="help">جارٍ التحميل…</p>
        ) : !openPool ? (
          <p className="help">لا يمكن عرض العروض هنا (الطلب ليس مزايدة بمدى سعر، أو تم إسناده، أو لم يعد في الحوض).</p>
        ) : bids.length === 0 ? (
          <p className="help">لا توجد عروض معلّقة حالياً.</p>
        ) : (
          <ul className="oh-claims-list" style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
            {bids.map((b) => (
              <li
                key={b.id}
                className="card"
                style={{
                  marginBottom: 10,
                  padding: "12px 14px",
                  border: "1px solid rgba(15, 23, 42, 0.08)",
                }}
              >
                <div style={{ fontWeight: 800 }}>{freelancerDisplayName(b.freelancer)}</div>
                <div className="help" style={{ marginTop: 4 }}>
                  {b.freelancer?.email ? <span dir="ltr">{b.freelancer.email}</span> : null}
                </div>
                <div style={{ marginTop: 8, fontWeight: 700, unicodeBidi: "plaintext" }} dir="ltr">
                  مبلغ العرض: {formatMoney(b.amount)}
                  {currencyCode ? ` ${currencyCode}` : ""}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => reject(b.id)}>
                    رفض العرض
                  </button>
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => accept(b.id)}>
                    اعتماد العرض وإسناد الطلب
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
