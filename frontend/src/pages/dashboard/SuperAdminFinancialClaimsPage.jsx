import { useEffect, useMemo, useState } from "react";
import {
  createSuperAdminFreelancerPaymentRequest,
  getSuperAdminFinancialClaimByIdRequest,
  listSuperAdminFinancialClaimsRequest,
  updateSuperAdminFinancialClaimPricingRequest,
  updateSuperAdminFinancialClaimStatusRequest,
} from "../../services/api";
import { useToast } from "../../components/ui/toastContext";
import { AdminInlineGridSkeleton } from "../../components/ui/Skeleton";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardToolbar from "../../components/dashboard/DashboardToolbar";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import StatusBadge from "../../components/dashboard/StatusBadge";
import DashboardModal from "../../components/dashboard/DashboardModal";

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

/** @param {string} [status] */
function claimStatusTone(status) {
  const v = String(status || "");
  if (v === "pending") return "pending";
  if (v === "accepted") return "success";
  if (v === "rejected") return "danger";
  if (v === "paid") return "success";
  if (v === "frozen") return "inactive";
  if (v === "requires_in_person_review") return "warning";
  return "neutral";
}

/** @param {string} [payout] */
function payoutStatusTone(payout) {
  const v = String(payout || "");
  if (v === "paid") return "success";
  if (v === "late_after_payout_window") return "danger";
  if (v === "within_payout_window") return "warning";
  if (v === "not_due_yet" || v === "missing_completion_date") return "inactive";
  return "neutral";
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

  const closeStatusModal = () => setStatusModal({ open: false, claim: null, status: "", adminNote: "" });
  const closePricingModal = () =>
    setPricingModal({
      open: false,
      claim: null,
      totalPriceSnapshot: "",
      userPercentageSnapshot: "",
      companyPercentageSnapshot: "",
    });
  const closePaymentModal = () =>
    setPaymentModal({ open: false, claim: null, paymentMethod: "bank_transfer", paymentReference: "", paidAt: "" });

  return (
    <DashboardShell>
      <DashboardPageHeader
        eyebrow="لوحة المدير الأعلى"
        title="إدارة المطالبات المالية"
        description="مراجعة المطالبات، تحديث الحالة والتسعير، وتسجيل الدفعات."
        breadcrumbs={superAdminBreadcrumbs("المطالبات المالية")}
      />

      <DashboardSection title="البحث والتصفية" description="اضبط المعايير ثم اضغط «تحديث» لإعادة جلب البيانات من الخادم.">
        <DashboardToolbar>
          <div className="oh-row-2col min-w-0 w-full">
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
        </DashboardToolbar>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={load}>
            تحديث
          </button>
        </div>
      </DashboardSection>

      <DashboardSection title="المطالبات" description="بطاقات لكل مطالبة مع إجراءات سريعة.">
        {busy ? (
          <DashboardLoadingState label="جارٍ تحميل المطالبات…">
            <AdminInlineGridSkeleton count={3} />
          </DashboardLoadingState>
        ) : null}

        {!busy && filteredClaims.length === 0 ? (
          <DashboardEmptyState title="لا توجد مطالبات" description="لا توجد مطالبات مطابقة للمعايير الحالية، أو القائمة فارغة بعد آخر تحديث." />
        ) : null}

        {!busy && filteredClaims.length > 0 ? (
          <div className="min-w-0 overflow-x-auto">
            <div className="cards-grid cards-grid--max-3">
            {filteredClaims.map((claim) => (
              <article key={claim.id} className="card">
                <h3 style={{ marginTop: 0 }}>{claim.requestTitle}</h3>
                <p>رقم الطلب: {claim.orderNumber}</p>
                <p>المستقل: {freelancerDisplay(claim.freelancer)}</p>
                <p style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <span>الحالة:</span>
                  <StatusBadge tone={claimStatusTone(claim.status)}>{statusAr(claim.status)}</StatusBadge>
                </p>
                <p style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <span>الاستحقاق:</span>
                  <StatusBadge tone={payoutStatusTone(claim.payoutStatus)}>{payoutAr(claim.payoutStatus)}</StatusBadge>
                </p>
                <p>نسبة المستقل: {formatPct(claim.userPercentageSnapshot)}</p>
                <p>نسبة الشركة: {formatPct(claim.companyPercentageSnapshot)}</p>
                <p>مستحق المستقل: {formatMoney(claim.userAmountSnapshot)}</p>
                <p>المتبقي: {formatMoney(claim.remainingAmount)}</p>
                <div className="actions-row">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setSelectedId(claim.id);
                      loadDetail(claim.id);
                    }}
                  >
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
          </div>
        ) : null}
      </DashboardSection>

      {detail ? (
        <DashboardSection title={`تفاصيل المطالبة #${detail.id}`} description="بيانات المطالبة المختارة وسجل تغيّر الحالة.">
          <div className="card">
            <p>العنوان: {detail.requestTitle}</p>
            <p>رقم الطلب: {detail.orderNumber}</p>
            <p>المستقل: {freelancerDisplay(detail.freelancer)}</p>
            <p style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <span>الحالة:</span>
              <StatusBadge tone={claimStatusTone(detail.status)}>{statusAr(detail.status)}</StatusBadge>
            </p>
            <p style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <span>الاستحقاق:</span>
              <StatusBadge tone={payoutStatusTone(detail.payoutStatus)}>{payoutAr(detail.payoutStatus)}</StatusBadge>
            </p>
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
        </DashboardSection>
      ) : null}

      <DashboardModal
        open={statusModal.open}
        title="تحديث حالة المطالبة"
        onClose={closeStatusModal}
        footer={
          <div className="client-order-modal__foot">
            <button type="button" className="btn btn-primary" disabled={actionBusy} onClick={applyStatus}>
              حفظ
            </button>
            <button type="button" className="btn btn-secondary" disabled={actionBusy} onClick={closeStatusModal}>
              إلغاء
            </button>
          </div>
        }
      >
        <div className="client-order-modal__body">
          <select className="input" value={statusModal.status} onChange={(e) => setStatusModal((p) => ({ ...p, status: e.target.value }))}>
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
      </DashboardModal>

      <DashboardModal
        open={pricingModal.open}
        title="تعديل التسعير"
        onClose={closePricingModal}
        footer={
          <div className="client-order-modal__foot">
            <button type="button" className="btn btn-primary" disabled={actionBusy} onClick={applyPricing}>
              حفظ
            </button>
            <button type="button" className="btn btn-secondary" disabled={actionBusy} onClick={closePricingModal}>
              إلغاء
            </button>
          </div>
        }
      >
        <div className="client-order-modal__body">
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
      </DashboardModal>

      <DashboardModal
        open={paymentModal.open}
        title="تسجيل دفعة"
        onClose={closePaymentModal}
        footer={
          <div className="client-order-modal__foot">
            <button type="button" className="btn btn-primary" disabled={actionBusy} onClick={registerPayment}>
              تأكيد الدفع
            </button>
            <button type="button" className="btn btn-secondary" disabled={actionBusy} onClick={closePaymentModal}>
              إلغاء
            </button>
          </div>
        }
      >
        <div className="client-order-modal__body">
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
      </DashboardModal>
    </DashboardShell>
  );
}
