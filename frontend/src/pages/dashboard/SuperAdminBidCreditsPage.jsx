import { useCallback, useEffect, useState } from "react";
import {
  adminGrantBidCreditsRequest,
  createAdminBidCreditPackageRequest,
  getAdminFreelancerBidCreditsRequest,
  listAdminBidCreditPackagesRequest,
  listAdminBidCreditPurchasesRequest,
  resolveAdminBidCreditPurchaseManualReviewRequest,
  updateAdminBidCreditPackageRequest,
} from "../../services/api";
import Button from "../../components/ui/Button";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/economyResources";

/**
 * Super Admin Bid Credits administration — Phase B1 + B6 packages/purchases inspect.
 */
export default function SuperAdminBidCreditsPage() {
  const { t, locale } = useTranslation();
  const [packages, setPackages] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [pkgError, setPkgError] = useState(null);
  const [pkgForm, setPkgForm] = useState({
    code: "",
    nameAr: "",
    nameEn: "",
    bidQuantity: 10,
    priceJod: "1.000",
    validityDays: 30,
  });
  const [freelancerId, setFreelancerId] = useState("");
  const [inspect, setInspect] = useState(null);
  const [grantForm, setGrantForm] = useState({
    amount: 5,
    expiresAt: "",
    reason: "",
    internalNote: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const loadPackages = useCallback(async () => {
    try {
      const res = await listAdminBidCreditPackagesRequest();
      setPackages(res?.data || []);
      setPkgError(null);
    } catch (err) {
      setPkgError(err?.response?.data?.message || err?.message || "error");
    }
  }, []);

  const loadPurchases = useCallback(async () => {
    try {
      const res = await listAdminBidCreditPurchasesRequest({ limit: 20 });
      setPurchases(res?.data?.purchases || []);
    } catch {
      setPurchases([]);
    }
  }, []);

  useEffect(() => {
    loadPackages();
    loadPurchases();
  }, [loadPackages, loadPurchases]);

  const resolveManual = async (purchaseId, resolution) => {
    setBusy(true);
    setMessage(null);
    try {
      await resolveAdminBidCreditPurchaseManualReviewRequest(purchaseId, { resolution });
      await loadPurchases();
      setMessage(t("economy.bidCreditsAdmin.resolvedReview"));
    } catch (err) {
      setMessage(err?.response?.data?.message || err?.message || "error");
    } finally {
      setBusy(false);
    }
  };

  const createPackage = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await createAdminBidCreditPackageRequest({
        code: pkgForm.code,
        nameAr: pkgForm.nameAr,
        nameEn: pkgForm.nameEn || null,
        bidQuantity: Number(pkgForm.bidQuantity),
        priceJod: Number(pkgForm.priceJod),
        validityDays: Number(pkgForm.validityDays),
        isActive: true,
      });
      setPkgForm({
        code: "",
        nameAr: "",
        nameEn: "",
        bidQuantity: 10,
        priceJod: "1.000",
        validityDays: 30,
      });
      await loadPackages();
      setMessage(t("economy.bidCreditsAdmin.packageCreated"));
    } catch (err) {
      setMessage(err?.response?.data?.message || err?.message || "error");
    } finally {
      setBusy(false);
    }
  };

  const togglePackage = async (pkg) => {
    if (busy) return;
    setBusy(true);
    try {
      await updateAdminBidCreditPackageRequest(pkg.id, { isActive: !pkg.isActive });
      await loadPackages();
    } catch (err) {
      setMessage(err?.response?.data?.message || err?.message || "error");
    } finally {
      setBusy(false);
    }
  };

  const inspectFreelancer = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await getAdminFreelancerBidCreditsRequest(freelancerId);
      setInspect(res?.data || null);
    } catch (err) {
      setInspect(null);
      setMessage(err?.response?.data?.message || err?.message || "error");
    } finally {
      setBusy(false);
    }
  };

  const grantBids = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await adminGrantBidCreditsRequest({
        freelancerUserId: Number(freelancerId),
        amount: Number(grantForm.amount),
        expiresAt: new Date(grantForm.expiresAt).toISOString(),
        reason: grantForm.reason,
        internalNote: grantForm.internalNote || null,
      });
      const res = await getAdminFreelancerBidCreditsRequest(freelancerId);
      setInspect(res?.data || null);
      setMessage(t("economy.bidCreditsAdmin.bidsGranted"));
    } catch (err) {
      setMessage(err?.response?.data?.message || err?.message || "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dashboard-page" style={{ padding: 20, maxWidth: 980 }}>
      <h1 style={{ marginTop: 0 }}>
        {t("economy.bidCreditsAdmin.title")}
      </h1>
      <p style={{ opacity: 0.85 }}>
        {t("economy.bidCreditsAdmin.intro")}
      </p>
      {message ? <p role="status">{message}</p> : null}

      <section className="fp-surface" style={{ marginBottom: 24, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>{t("economy.bidCreditsAdmin.packagesTitle")}</h2>
        {pkgError ? <p>{pkgError}</p> : null}
        <ul>
          {(packages || []).map((pkg) => (
            <li key={pkg.id} style={{ marginBottom: 8 }}>
              <strong>{locale === "en" ? pkg.nameEn || pkg.nameAr : pkg.nameAr}</strong> — {pkg.bidQuantity}{" "}
              {t("economy.bidCreditsAdmin.bidUnit")} / {pkg.priceJod} JOD
              {pkg.validityDays != null
                ? ` / ${pkg.validityDays} ${t("economy.bidCreditsAdmin.days")}`
                : ""}{" "}
              <Button type="button" size="sm" disabled={busy} onClick={() => togglePackage(pkg)}>
                {pkg.isActive ? (t("economy.bidCreditsAdmin.deactivate")) : t("economy.bidCreditsAdmin.activate")}
              </Button>
            </li>
          ))}
        </ul>
        <form onSubmit={createPackage} style={{ display: "grid", gap: 8, maxWidth: 420 }}>
          <input
            placeholder={t("economy.bidCreditsAdmin.codePh")}
            value={pkgForm.code}
            onChange={(e) => setPkgForm((p) => ({ ...p, code: e.target.value }))}
            required
          />
          <input
            placeholder={t("economy.bidCreditsAdmin.nameArPh")}
            value={pkgForm.nameAr}
            onChange={(e) => setPkgForm((p) => ({ ...p, nameAr: e.target.value }))}
            required
          />
          <input
            placeholder={t("economy.bidCreditsAdmin.nameEnPh")}
            value={pkgForm.nameEn}
            onChange={(e) => setPkgForm((p) => ({ ...p, nameEn: e.target.value }))}
          />
          <input
            type="number"
            min="1"
            value={pkgForm.bidQuantity}
            onChange={(e) => setPkgForm((p) => ({ ...p, bidQuantity: e.target.value }))}
          />
          <input
            type="number"
            min="0"
            step="0.001"
            value={pkgForm.priceJod}
            onChange={(e) => setPkgForm((p) => ({ ...p, priceJod: e.target.value }))}
          />
          <input
            type="number"
            min="1"
            max="3650"
            value={pkgForm.validityDays}
            onChange={(e) => setPkgForm((p) => ({ ...p, validityDays: e.target.value }))}
            placeholder={t("economy.bidCreditsAdmin.validityPh")}
            required
          />
          <Button type="submit" disabled={busy}>
            {t("economy.bidCreditsAdmin.createPackage")}
          </Button>
        </form>
      </section>

      <section className="fp-surface" style={{ marginBottom: 24, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>
          {t("economy.bidCreditsAdmin.purchasesTitle")}
        </h2>
        <p style={{ opacity: 0.8, fontSize: "0.9rem" }}>
          {t("economy.bidCreditsAdmin.purchasesNote")}
        </p>
        {purchases.length === 0 ? (
          <p style={{ opacity: 0.7 }}>{t("economy.bidCreditsAdmin.noPurchases")}</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
            {purchases.map((p) => (
              <li key={p.id} style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 8 }}>
                <div>
                  #{p.id} · user {p.freelancerUserId} · {p.bidQuantitySnapshot} Bids / {p.priceJodSnapshot}{" "}
                  JOD · fulfill={p.status} · reversal={p.paymentReversalStatus}
                </div>
                <div style={{ fontSize: "0.85rem", opacity: 0.85 }}>
                  consumed@reversal={p.consumedBeforeReversal ?? "—"} · frozen={p.unusedFrozenAmount} ·
                  revoked={p.unusedRevokedAmount}
                  {p.manualReviewRequired ? (t("economy.bidCreditsAdmin.manualReview")) : ""}
                </div>
                {p.manualReviewRequired ? (
                  <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                    <Button type="button" size="sm" disabled={busy} onClick={() => resolveManual(p.id, "keep_frozen")}>
                      {t("economy.bidCreditsAdmin.keepFrozen")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => resolveManual(p.id, "release_remaining")}
                    >
                      {t("economy.bidCreditsAdmin.releaseRemaining")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => resolveManual(p.id, "revoke_remaining")}
                    >
                      {t("economy.bidCreditsAdmin.revokeRemaining")}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="fp-surface" style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>{t("economy.bidCreditsAdmin.freelancerMgmt")}</h2>
        <form onSubmit={inspectFreelancer} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            placeholder={t("economy.bidCreditsAdmin.freelancerIdPh")}
            value={freelancerId}
            onChange={(e) => setFreelancerId(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy}>
            {t("economy.bidCreditsAdmin.inspect")}
          </Button>
        </form>
        {inspect ? (
          <div style={{ marginBottom: 16 }}>
            <p>
              {t("economy.bidCreditsAdmin.availableBids")}: <strong>{inspect.availableBids}</strong>
            </p>
            <p>
              {t("economy.bidCreditsAdmin.fromMembership")}: {inspect.membershipDerivedAvailable} |{" "}
              {t("economy.bidCreditsAdmin.manual")}: {inspect.manualAdminAvailable}
            </p>
          </div>
        ) : null}
        <form onSubmit={grantBids} style={{ display: "grid", gap: 8, maxWidth: 420 }}>
          <input
            type="number"
            min="1"
            value={grantForm.amount}
            onChange={(e) => setGrantForm((p) => ({ ...p, amount: e.target.value }))}
            placeholder={t("economy.bidCreditsAdmin.amountPh")}
            required
          />
          <input
            type="datetime-local"
            value={grantForm.expiresAt}
            onChange={(e) => setGrantForm((p) => ({ ...p, expiresAt: e.target.value }))}
            required
          />
          <input
            value={grantForm.reason}
            onChange={(e) => setGrantForm((p) => ({ ...p, reason: e.target.value }))}
            placeholder={t("economy.bidCreditsAdmin.reasonPh")}
            required
          />
          <input
            value={grantForm.internalNote}
            onChange={(e) => setGrantForm((p) => ({ ...p, internalNote: e.target.value }))}
            placeholder={t("economy.bidCreditsAdmin.notePh")}
          />
          <Button type="submit" disabled={busy || !freelancerId}>
            {t("economy.bidCreditsAdmin.grantBids")}
          </Button>
        </form>
      </section>
    </div>
  );
}
