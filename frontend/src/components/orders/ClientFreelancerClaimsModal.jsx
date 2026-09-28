import { useCallback, useEffect, useState } from "react";
import {
  approveClientOrderClaimRequest,
  listClientOrderClaimsRequest,
  rejectClientOrderClaimRequest,
} from "../../services/api";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/clientAreaResources";

function applicantDisplayName(row) {
  if (row?.displayName) return row.displayName;
  const f = row?.freelancer;
  if (!f) return "—";
  const parts = [f.firstName, f.fatherName, f.familyName].filter(Boolean);
  return parts.length ? parts.join(" ") : "—";
}

export default function ClientFreelancerClaimsModal({ open, orderId, onClose, onChanged }) {
  const { t } = useTranslation();
  const c = "clientArea.freelancerClaims";
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState([]);
  const [openPool, setOpenPool] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError("");
    try {
      const res = await listClientOrderClaimsRequest(orderId);
      const payload = res?.data ?? res;
      setClaims(Array.isArray(payload?.claims) ? payload.claims : []);
      setOpenPool(Boolean(payload?.orderSummary?.hasOpenPool));
    } catch (e) {
      const message = e?.response?.data?.message || e?.message || t(`${c}.loadError`);
      setError(message);
      setClaims([]);
      setOpenPool(false);
    } finally {
      setLoading(false);
    }
  }, [orderId, t]);

  useEffect(() => {
    if (open && orderId) load();
  }, [open, orderId, load]);

  if (!open) return null;

  const approve = async (claimId) => {
    setBusy(true);
    setError("");
    try {
      await approveClientOrderClaimRequest(orderId, claimId);
      onChanged?.();
      onClose();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || t(`${c}.approveError`));
    } finally {
      setBusy(false);
    }
  };

  const reject = async (claimId) => {
    setBusy(true);
    setError("");
    try {
      await rejectClientOrderClaimRequest(orderId, claimId);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || t(`${c}.rejectError`));
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
        aria-labelledby="claims-modal-title"
        onMouseDown={(ev) => ev.stopPropagation()}
        style={{ maxWidth: 520, width: "100%", maxHeight: "90vh", overflow: "auto" }}
      >
        <h2 id="claims-modal-title" style={{ marginTop: 0 }}>
          {t(`${c}.title`)}
        </h2>
        <p className="help" style={{ marginTop: 0 }}>
          {t(`${c}.description`)}
        </p>
        {error ? (
          <p className="help" style={{ color: "#b91c1c", marginTop: 8 }}>
            {error}
          </p>
        ) : null}
        {loading ? (
          <p className="help">{t("clientArea.common.loading")}</p>
        ) : !openPool ? (
          <p className="help">{t(`${c}.notAvailable`)}</p>
        ) : claims.length === 0 ? (
          <p className="help">{t(`${c}.empty`)}</p>
        ) : (
          <ul className="oh-claims-list" style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
            {claims.map((claim) => (
              <li
                key={claim.id}
                className="card"
                style={{
                  marginBottom: 10,
                  padding: "12px 14px",
                  border: "1px solid rgba(15, 23, 42, 0.08)",
                }}
              >
                <div style={{ fontWeight: 800 }}>{applicantDisplayName(claim)}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => reject(claim.id)}>
                    {t("clientArea.common.reject")}
                  </button>
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => approve(claim.id)}>
                    {t(`${c}.approveAndAssign`)}
                  </button>
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
