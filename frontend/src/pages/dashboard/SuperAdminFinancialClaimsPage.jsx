import { useEffect, useMemo, useState } from "react";
import {
  createSuperAdminFreelancerPaymentRequest,
  getSuperAdminFinancialClaimByIdRequest,
  listSuperAdminFinancialClaimsRequest,
  updateSuperAdminFinancialClaimPricingRequest,
  updateSuperAdminFinancialClaimStatusRequest,
} from "../../services/api";
import { useToast } from "../../components/ui/toastContext";

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function formatMoney(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value));
}

function statusAr(s) {
  const v = String(s || "");
  if (v === "pending") return "قيد المراجعة";
  if (v === "accepted") return "مقبولة";
  if (v === "rejected") return "مرفوضة";
  if (v === "frozen") return "مجمدة";
  if (v === "requires_in_person_review") return "تحتاج مراجعة حضورية";
  if (v === "paid") return "مدفوعة";
  return v || "—";
}

function payoutAr(s) {
  const v = String(s || "");
  if (v === "missing_completion_date") return "بدون تاريخ إنجاز";
  if (v === "not_due_yet") return "غير مستحقة بعد";
  if (v === "within_payout_window") return "داخل نافذة الاستحقاق";
  if (v === "late_after_payout_window") return "متأخرة";
  if (v === "paid") return "مدفوعة";
  return v || "—";
}

function freelancerDisplay(freelancer) {
  const fullName = [freelancer?.firstName, freelancer?.fatherName, freelancer?.familyName]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(" ");
  const email = String(freelancer?.email || "").trim();
  if (fullName && email) return `${fullName} (${email})`;
  if (fullName) return fullName;
  if (email) return email;
  return "—";
}

function formatPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n)}%`;
}

const CLAIM_STATUS_OPTIONS = [
  { value: "", label: "كل الحالات" },
  { value: "pending", label: "قيد المراجعة" },
  { value: "accepted", label: "مقبولة" },
  { value: "rejected", label: "مرفوضة" },
  { value: "frozen", label: "مجمدة" },
  { value: "requires_in_person_review", label: "تحتاج مراجعة حضورية" },
  { value: "paid", label: "مدفوعة" },
];

const PAYOUT_STATUS_OPTIONS = [
  { value: "", label: "كل حالات الاستحقاق" },
  { value: "missing_completion_date", label: "بدون تاريخ إنجاز" },
  { value: "not_due_yet", label: "غير مستحقة بعد" },
  { value: "within_payout_window", label: "داخل نافذة الاستحقاق" },
  { value: "late_after_payout_window", label: "متأخرة بعد نافذة الاستحقاق" },
  { value: "paid", label: "مدفوعة" },
];

export default function SuperAdminFinancialClaimsPage() {
  const { push } = useToast();
  const [claims, setClaims] = useState([]);
  const [busy, setBusy] = useState(true);
  const [filters, setFilters] = useState({ q: "", status: "", payoutStatus: "" });
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  const [statusModal, setStatusModal] = useState({ open: false, claim: null, status: "", adminNote: "" });
  const [pricingModal, setPricingModal] = useState({
    open: false,
    claim: null,
    totalPriceSnapshot: "",
    userPercentageSnapshot: "",
    companyPercentageSnapshot: "",
  });
  const [paymentModal, setPaymentModal] = useState({
    open: false,
    claim: null,
    paymentMethod: "bank_transfer",
    paymentReference: "",
    paidAt: "",
  });

  const load = async () => {
    setBusy(true);
    try {
      const params = {};
      if (String(filters.q || "").trim()) params.q = String(filters.q).trim();
      if (String(filters.status || "").trim()) params.status = String(filters.status).trim();
      if (String(filters.payoutStatus || "").trim()) params.payoutStatus = String(filters.payoutStatus).trim();
      const res = await listSuperAdminFinancialClaimsRequest(params);
      setClaims(res?.data?.claims || []);
    } catch (e) {
      push({ type: "error", title: "تعذر تحميل المطالبات", message: e?.response?.data?.message || e?.message });
    } finally {
      setBusy(false);
    }
  };

  const loadDetail = async (id) => {
    try {
      const res = await getSuperAdminFinancialClaimByIdRequest(id);
      setDetail(res?.data?.claim || null);
    } catch (e) {
      push({ type: "error", title: "تعذر تحميل التفاصيل", message: e?.response?.data?.message || e?.message });
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredClaims = useMemo(() => claims, [claims]);

  const applyStatus = async () => {
    if (!statusModal.claim) return;
    setActionBusy(true);
    try {
      await updateSuperAdminFinancialClaimStatusRequest(statusModal.claim.id, {
        status: statusModal.status,
        adminNote: statusModal.adminNote || null,
      });
      setStatusModal({ open: false, claim: null, status: "", adminNote: "" });
      await load();
      if (selectedId) await loadDetail(selectedId);
      push({ type: "success", title: "تم تحديث الحالة" });
    } catch (e) {
      push({ type: "error", title: "تعذر تحديث الحالة", message: e?.response?.data?.message || e?.message });
    } finally {
      setActionBusy(false);
    }
  };

  const applyPricing = async () => {
    if (!pricingModal.claim) return;
    setActionBusy(true);
    try {
      await updateSuperAdminFinancialClaimPricingRequest(pricingModal.claim.id, {
        totalPriceSnapshot: Number(pricingModal.totalPriceSnapshot),
        userPercentageSnapshot: Number(pricingModal.userPercentageSnapshot),
        companyPercentageSnapshot: Number(pricingModal.companyPercentageSnapshot),
      });
      setPricingModal({
        open: false,
        claim: null,
        totalPriceSnapshot: "",
        userPercentageSnapshot: "",
        companyPercentageSnapshot: "",
      });
      await load();
      if (selectedId) await loadDetail(selectedId);
      push({ type: "success", title: "تم تحديث التسعير" });
    } catch (e) {
      push({ type: "error", title: "تعذر تحديث التسعير", message: e?.response?.data?.message || e?.message });
    } finally {
      setActionBusy(false);
    }
  };

  const registerPayment = async () => {
    if (!paymentModal.claim) return;
    setActionBusy(true);
    try {
      await createSuperAdminFreelancerPaymentRequest({
        freelancerId: Number(paymentModal.claim.freelancerId),
        paymentMethod: paymentModal.paymentMethod,
        paymentReference: paymentModal.paymentReference || null,
        paidAt: paymentModal.paidAt || null,
        claimIds: [Number(paymentModal.claim.id)],
      });
      setPaymentModal({ open: false, claim: null, paymentMethod: "bank_transfer", paymentReference: "", paidAt: "" });
      await load();
      if (selectedId) await loadDetail(selectedId);
      push({ type: "success", title: "تم تسجيل الدفع" });
    } catch (e) {
      push({ type: "error", title: "تعذر تسجيل الدفع", message: e?.response?.data?.message || e?.message });
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <section className="container page-content dash-shell">
      <div className="dash">
        <header className="dash-hero dash-hero--compact">
          <div className="dash-hero__copy">
            <p className="dash-hero__kicker">لوحة المدير الأعلى</p>
            <h1 className="dash-hero__title">إدارة المطالبات المالية</h1>
            <p className="dash-hero__subtitle">مراجعة المطالبات، تحديث الحالة والتسعير، وتسجيل الدفعات.</p>
          </div>
        </header>

        <section className="dash-section">
          <div className="oh-row-2col">
            <input
              className="input"
              placeholder="بحث برقم الطلب أو اسم/إيميل المستقل..."
              value={filters.q}
              onChange={(e) => setFilters((p) => ({ ...p, q: e.target.value }))}
            />
            <div className="oh-row-2col">
              <select className="input" value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
                {CLAIM_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value || "all"} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={filters.payoutStatus}
                onChange={(e) => setFilters((p) => ({ ...p, payoutStatus: e.target.value }))}
              >
                {PAYOUT_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value || "all"} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={load}>تحديث</button>
          </div>
        </section>

        <section className="dash-section">
          {busy ? (
            <div className="card">جارٍ التحميل...</div>
          ) : (
            <div className="cards-grid cards-grid--max-3">
              {filteredClaims.map((claim) => (
                <article key={claim.id} className="card">
                  <h3 style={{ marginTop: 0 }}>{claim.requestTitle}</h3>
                  <p>رقم الطلب: {claim.orderNumber}</p>
                  <p>المستقل: {freelancerDisplay(claim.freelancer)}</p>
                  <p>الحالة: {statusAr(claim.status)}</p>
                  <p>الاستحقاق: {payoutAr(claim.payoutStatus)}</p>
                  <p>نسبة المستقل: {formatPct(claim.userPercentageSnapshot)}</p>
                  <p>نسبة الشركة: {formatPct(claim.companyPercentageSnapshot)}</p>
                  <p>مستحق المستقل: {formatMoney(claim.userAmountSnapshot)}</p>
                  <p>المتبقي: {formatMoney(claim.remainingAmount)}</p>
                  <div className="actions-row">
                    <button type="button" className="btn btn-secondary" onClick={() => { setSelectedId(claim.id); loadDetail(claim.id); }}>
                      التفاصيل
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setStatusModal({ open: true, claim, status: claim.status, adminNote: claim.adminNote || "" })}
                    >
                      تغيير الحالة
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() =>
                        setPricingModal({
                          open: true,
                          claim,
                          totalPriceSnapshot: claim.totalPriceSnapshot ?? "",
                          userPercentageSnapshot: claim.userPercentageSnapshot ?? "",
                          companyPercentageSnapshot: claim.companyPercentageSnapshot ?? "",
                        })
                      }
                    >
                      تعديل التسعير
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setPaymentModal({ open: true, claim, paymentMethod: "bank_transfer", paymentReference: "", paidAt: "" })}
                    >
                      تسجيل الدفع
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {detail ? (
          <section className="dash-section">
            <div className="dash-section__head">
              <h2 className="dash-section__title">تفاصيل المطالبة #{detail.id}</h2>
            </div>
            <div className="card">
              <p>العنوان: {detail.requestTitle}</p>
              <p>رقم الطلب: {detail.orderNumber}</p>
              <p>المستقل: {freelancerDisplay(detail.freelancer)}</p>
              <p>الحالة: {statusAr(detail.status)}</p>
              <p>الاستحقاق: {payoutAr(detail.payoutStatus)}</p>
              <p>نسبة المستقل: {formatPct(detail.userPercentageSnapshot)}</p>
              <p>نسبة الشركة: {formatPct(detail.companyPercentageSnapshot)}</p>
              <p>السعر الإجمالي: {formatMoney(detail.totalPriceSnapshot)}</p>
              <p>مستحق المستقل: {formatMoney(detail.userAmountSnapshot)}</p>
              <p>مدفوع: {formatMoney(detail.paidAmount)}</p>
              <p>المتبقي: {formatMoney(detail.remainingAmount)}</p>
              <p>تاريخ الإنجاز الفعلي: {formatDate(detail.actualCompletionDate)}</p>
            </div>
            <div className="card" style={{ marginTop: 10 }}>
              <h3 style={{ marginTop: 0 }}>سجل الحالة (Timeline)</h3>
              {(detail.statusHistory || []).length === 0 ? (
                <p>لا يوجد سجل.</p>
              ) : (
                <ul className="simple-list">
                  {detail.statusHistory.map((h) => (
                    <li key={h.id}>
                      {statusAr(h.oldStatus || "—")} ← {statusAr(h.newStatus)} | {formatDate(h.changedAt)}
                      {h.adminNote ? ` | ملاحظة: ${h.adminNote}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ) : null}
      </div>

      {statusModal.open ? (
        <div className="client-order-modal-overlay">
          <div className="client-order-modal">
            <div className="client-order-modal__body">
              <h3>تحديث حالة المطالبة</h3>
              <select
                className="input"
                value={statusModal.status}
                onChange={(e) => setStatusModal((p) => ({ ...p, status: e.target.value }))}
              >
                {CLAIM_STATUS_OPTIONS.filter((opt) => opt.value).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <textarea
                className="textarea"
                placeholder="ملاحظة الإدارة..."
                value={statusModal.adminNote}
                onChange={(e) => setStatusModal((p) => ({ ...p, adminNote: e.target.value }))}
              />
            </div>
            <div className="client-order-modal__foot">
              <button type="button" className="btn btn-primary" disabled={actionBusy} onClick={applyStatus}>حفظ</button>
              <button type="button" className="btn btn-secondary" disabled={actionBusy} onClick={() => setStatusModal({ open: false, claim: null, status: "", adminNote: "" })}>إلغاء</button>
            </div>
          </div>
        </div>
      ) : null}

      {pricingModal.open ? (
        <div className="client-order-modal-overlay">
          <div className="client-order-modal">
            <div className="client-order-modal__body">
              <h3>تعديل التسعير</h3>
              <input
                className="input"
                type="number"
                min="0"
                placeholder="إجمالي السعر"
                value={pricingModal.totalPriceSnapshot}
                onChange={(e) => setPricingModal((p) => ({ ...p, totalPriceSnapshot: e.target.value }))}
              />
              <input
                className="input"
                type="number"
                min="0"
                max="100"
                placeholder="نسبة المستقل"
                value={pricingModal.userPercentageSnapshot}
                onChange={(e) => setPricingModal((p) => ({ ...p, userPercentageSnapshot: e.target.value }))}
              />
              <input
                className="input"
                type="number"
                min="0"
                max="100"
                placeholder="نسبة الشركة"
                value={pricingModal.companyPercentageSnapshot}
                onChange={(e) => setPricingModal((p) => ({ ...p, companyPercentageSnapshot: e.target.value }))}
              />
            </div>
            <div className="client-order-modal__foot">
              <button type="button" className="btn btn-primary" disabled={actionBusy} onClick={applyPricing}>حفظ</button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={actionBusy}
                onClick={() =>
                  setPricingModal({
                    open: false,
                    claim: null,
                    totalPriceSnapshot: "",
                    userPercentageSnapshot: "",
                    companyPercentageSnapshot: "",
                  })
                }
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {paymentModal.open ? (
        <div className="client-order-modal-overlay">
          <div className="client-order-modal">
            <div className="client-order-modal__body">
              <h3>تسجيل دفعة</h3>
              <p>المطالبة: #{paymentModal.claim?.id}</p>
              <p>المبلغ المتبقي: {formatMoney(paymentModal.claim?.remainingAmount)}</p>
              <input
                className="input"
                placeholder="طريقة الدفع"
                value={paymentModal.paymentMethod}
                onChange={(e) => setPaymentModal((p) => ({ ...p, paymentMethod: e.target.value }))}
              />
              <input
                className="input"
                placeholder="مرجع الدفع"
                value={paymentModal.paymentReference}
                onChange={(e) => setPaymentModal((p) => ({ ...p, paymentReference: e.target.value }))}
              />
              <input
                className="input"
                type="datetime-local"
                value={paymentModal.paidAt}
                onChange={(e) => setPaymentModal((p) => ({ ...p, paidAt: e.target.value }))}
              />
            </div>
            <div className="client-order-modal__foot">
              <button type="button" className="btn btn-primary" disabled={actionBusy} onClick={registerPayment}>تأكيد الدفع</button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={actionBusy}
                onClick={() =>
                  setPaymentModal({ open: false, claim: null, paymentMethod: "bank_transfer", paymentReference: "", paidAt: "" })
                }
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
