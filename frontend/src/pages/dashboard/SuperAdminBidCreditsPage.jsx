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

/**
 * Super Admin Bid Credits administration — Phase B1 + B6 packages/purchases inspect.
 */
export default function SuperAdminBidCreditsPage() {
  const { locale } = useTranslation();
  const isEn = locale === "en";
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
      setMessage(isEn ? "Manual review resolved." : "تم حل المراجعة اليدوية.");
    } catch (err) {
      setMessage(err?.response?.data?.message || err?.message || "error");
    } finally {
      setBusy(false);
    }
  };

  const createPackage = async (e) => {
    e.preventDefault();
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
      setMessage(isEn ? "Package created." : "تم إنشاء الباقة.");
    } catch (err) {
      setMessage(err?.response?.data?.message || err?.message || "error");
    } finally {
      setBusy(false);
    }
  };

  const togglePackage = async (pkg) => {
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
      setMessage(isEn ? "Bids granted." : "تم منح العروض.");
    } catch (err) {
      setMessage(err?.response?.data?.message || err?.message || "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dashboard-page" style={{ padding: 20, maxWidth: 980 }}>
      <h1 style={{ marginTop: 0 }}>
        {isEn ? "Bid Credits administration" : "إدارة العروض المتاحة"}
      </h1>
      <p style={{ opacity: 0.85 }}>
        {isEn
          ? "Bid package pricing (quantity, JOD price, validity days) and manual Freelancer grants. Commercial Checkout is dormant until engines are enabled."
          : "تسعير باقات العروض (الكمية، السعر بالدينار، مدة الصلاحية) والمنح اليدوية. الشراء التجاري يبقى خاملاً حتى تفعيل المحركات."}
      </p>
      {message ? <p role="status">{message}</p> : null}

      <section className="fp-surface" style={{ marginBottom: 24, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>{isEn ? "Bid packages" : "باقات العروض"}</h2>
        {pkgError ? <p>{pkgError}</p> : null}
        <ul>
          {(packages || []).map((pkg) => (
            <li key={pkg.id} style={{ marginBottom: 8 }}>
              <strong>{isEn ? pkg.nameEn || pkg.nameAr : pkg.nameAr}</strong> — {pkg.bidQuantity}{" "}
              {isEn ? "Bids" : "عرض"} / {pkg.priceJod} JOD
              {pkg.validityDays != null
                ? ` / ${pkg.validityDays} ${isEn ? "days" : "يوم"}`
                : ""}{" "}
              <Button type="button" size="sm" disabled={busy} onClick={() => togglePackage(pkg)}>
                {pkg.isActive ? (isEn ? "Deactivate" : "إيقاف") : isEn ? "Activate" : "تفعيل"}
              </Button>
            </li>
          ))}
        </ul>
        <form onSubmit={createPackage} style={{ display: "grid", gap: 8, maxWidth: 420 }}>
          <input
            placeholder={isEn ? "code" : "الرمز"}
            value={pkgForm.code}
            onChange={(e) => setPkgForm((p) => ({ ...p, code: e.target.value }))}
            required
          />
          <input
            placeholder={isEn ? "Name AR" : "الاسم عربي"}
            value={pkgForm.nameAr}
            onChange={(e) => setPkgForm((p) => ({ ...p, nameAr: e.target.value }))}
            required
          />
          <input
            placeholder={isEn ? "Name EN" : "الاسم إنجليزي"}
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
            placeholder={isEn ? "Validity days" : "مدة الصلاحية (أيام)"}
            required
          />
          <Button type="submit" disabled={busy}>
            {isEn ? "Create package" : "إنشاء باقة"}
          </Button>
        </form>
      </section>

      <section className="fp-surface" style={{ marginBottom: 24, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>
          {isEn ? "Package purchases (inspect)" : "عمليات شراء الباقات (مراجعة)"}
        </h2>
        <p style={{ opacity: 0.8, fontSize: "0.9rem" }}>
          {isEn
            ? "No in-app Stripe refund button. Partial refunds require manual keep/release/revoke of remaining Bids only."
            : "لا يوجد زر استرداد Stripe داخل التطبيق. الاسترداد الجزئي يتطلب إبقاء/تحرير/إلغاء العروض المتبقية يدوياً فقط."}
        </p>
        {purchases.length === 0 ? (
          <p style={{ opacity: 0.7 }}>{isEn ? "No purchases yet." : "لا عمليات شراء بعد."}</p>
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
                  {p.manualReviewRequired ? (isEn ? " · MANUAL REVIEW" : " · مراجعة يدوية") : ""}
                </div>
                {p.manualReviewRequired ? (
                  <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                    <Button type="button" size="sm" disabled={busy} onClick={() => resolveManual(p.id, "keep_frozen")}>
                      {isEn ? "Keep frozen" : "إبقاء مجمّد"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => resolveManual(p.id, "release_remaining")}
                    >
                      {isEn ? "Release remaining" : "تحرير المتبقي"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => resolveManual(p.id, "revoke_remaining")}
                    >
                      {isEn ? "Revoke remaining" : "إلغاء المتبقي"}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="fp-surface" style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>{isEn ? "Freelancer Bid management" : "إدارة عروض المستقل"}</h2>
        <form onSubmit={inspectFreelancer} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            placeholder={isEn ? "Freelancer user id" : "معرّف المستقل"}
            value={freelancerId}
            onChange={(e) => setFreelancerId(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy}>
            {isEn ? "Inspect" : "عرض"}
          </Button>
        </form>
        {inspect ? (
          <div style={{ marginBottom: 16 }}>
            <p>
              {isEn ? "Available Bids" : "العروض المتاحة"}: <strong>{inspect.availableBids}</strong>
            </p>
            <p>
              {isEn ? "Membership-derived" : "من العضوية"}: {inspect.membershipDerivedAvailable} |{" "}
              {isEn ? "Manual" : "يدوي"}: {inspect.manualAdminAvailable}
            </p>
          </div>
        ) : null}
        <form onSubmit={grantBids} style={{ display: "grid", gap: 8, maxWidth: 420 }}>
          <input
            type="number"
            min="1"
            value={grantForm.amount}
            onChange={(e) => setGrantForm((p) => ({ ...p, amount: e.target.value }))}
            placeholder={isEn ? "Amount" : "الكمية"}
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
            placeholder={isEn ? "Reason (required)" : "السبب (مطلوب)"}
            required
          />
          <input
            value={grantForm.internalNote}
            onChange={(e) => setGrantForm((p) => ({ ...p, internalNote: e.target.value }))}
            placeholder={isEn ? "Internal note" : "ملاحظة داخلية"}
          />
          <Button type="submit" disabled={busy || !freelancerId}>
            {isEn ? "Grant Bids" : "منح عروض"}
          </Button>
        </form>
      </section>
    </div>
  );
}
