import "../../i18n/financeResources";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "../../i18n/LanguageProvider";
import {
  createSuperAdminFreelancerPaymentRequest,
  getSuperAdminFinancialClaimByIdRequest,
  listSuperAdminFinancialClaimsRequest,
  updateSuperAdminFinancialClaimPricingRequest,
  updateSuperAdminFinancialClaimStatusRequest,
} from "../../services/api";
import { useToast } from "../../components/ui/toastContext";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
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

function formatDate(value, locale) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  const tag = locale === "en" ? "en-GB" : "ar-JO-u-nu-latn";
  return new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function formatMoney(value, locale = "ar") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const suffix = locale === "en" ? "JOD" : "د.أ";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value))} ${suffix}`;
}

function claimStatusLabel(s, t) {
  const v = String(s || "");
  const key = `finance.claimStatus.${v}`;
  const label = v ? t(key) : "";
  if (label && label !== key) return label;
  return v || "—";
}

function payoutStatusLabel(s, t) {
  const v = String(s || "");
  const key = `finance.payoutStatus.${v}`;
  const label = v ? t(key) : "";
  if (label && label !== key) return label;
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

const CLAIM_STATUS_VALUES = ["", "pending", "accepted", "rejected", "frozen", "requires_in_person_review", "paid"];
const CLAIM_STATUS_CHANGE_VALUES = ["pending", "accepted", "rejected", "frozen", "requires_in_person_review"];
const PAYOUT_STATUS_VALUES = [
  "",
  "missing_completion_date",
  "not_due_yet",
  "within_payout_window",
  "late_after_payout_window",
  "paid",
];

export default function SuperAdminFinancialClaimsPage() {
  const { t, locale } = useTranslation();
  const money = (value) => formatMoney(value, locale);
  const { push } = useToast();
  const sc = "finance.superAdminClaims";

  const claimStatusOptions = useMemo(
    () =>
      CLAIM_STATUS_VALUES.map((value) => ({
        value,
        label: value ? claimStatusLabel(value, t) : t(`${sc}.filterAllStatuses`),
      })),
    [t, sc],
  );

  const claimStatusChangeOptions = useMemo(
    () =>
      CLAIM_STATUS_CHANGE_VALUES.map((value) => ({
        value,
        label: claimStatusLabel(value, t),
      })),
    [t],
  );

  const payoutStatusOptions = useMemo(
    () =>
      PAYOUT_STATUS_VALUES.map((value) => ({
        value,
        label: value ? payoutStatusLabel(value, t) : t(`${sc}.filterAllPayoutStatuses`),
      })),
    [t, sc],
  );
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
      push({ type: "error", title: t(`${sc}.toastLoadClaimsError`), message: getSafeApiErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const loadDetail = async (id) => {
    try {
      const res = await getSuperAdminFinancialClaimByIdRequest(id);
      setDetail(res?.data?.claim || null);
    } catch (e) {
      push({ type: "error", title: t(`${sc}.toastLoadDetailError`), message: getSafeApiErrorMessage(e) });
    }
  };

  useEffect(() => {
    const handle = setTimeout(() => {
      void load();
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q, filters.status, filters.payoutStatus]);

  const filteredClaims = useMemo(() => claims, [claims]);

  const applyStatus = async () => {
    if (actionBusy || !statusModal.claim || !statusModal.status) return;
    if (String(statusModal.status) === "paid") {
      push({
        type: "error",
        title: t(`${sc}.toastStatusUpdateError`),
        message: t(`${sc}.toastCannotMarkPaidHere`),
      });
      return;
    }
    if (
      (statusModal.status === "rejected" || statusModal.status === "frozen") &&
      String(statusModal.adminNote || "").trim().length < 3
    ) {
      push({
        type: "error",
        title: t(`${sc}.toastNoteRequiredTitle`),
        message: t(`${sc}.toastNoteRequiredMessage`),
      });
      return;
    }
    setActionBusy(true);
    try {
      await updateSuperAdminFinancialClaimStatusRequest(statusModal.claim.id, {
        status: statusModal.status,
        adminNote: statusModal.adminNote || null,
      });
      setStatusModal({ open: false, claim: null, status: "", adminNote: "" });
      await load();
      if (selectedId) await loadDetail(selectedId);
      push({ type: "success", title: t(`${sc}.toastStatusUpdated`) });
    } catch (e) {
      push({ type: "error", title: t(`${sc}.toastStatusUpdateError`), message: getSafeApiErrorMessage(e) });
    } finally {
      setActionBusy(false);
    }
  };

  const applyPricing = async () => {
    if (actionBusy || !pricingModal.claim) return;
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
      push({ type: "success", title: t(`${sc}.toastPricingUpdated`) });
    } catch (e) {
      push({ type: "error", title: t(`${sc}.toastPricingUpdateError`), message: getSafeApiErrorMessage(e) });
    } finally {
      setActionBusy(false);
    }
  };

  const registerPayment = async () => {
    if (actionBusy || !paymentModal.claim) return;
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
      push({ type: "success", title: t(`${sc}.toastPaymentRegistered`) });
    } catch (e) {
      push({ type: "error", title: t(`${sc}.toastPaymentRegisterError`), message: getSafeApiErrorMessage(e) });
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
        eyebrow={t(`${sc}.eyebrow`)}
        title={t(`${sc}.title`)}
        description={t(`${sc}.description`)}
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.financialClaims")}
      />

      <DashboardSection title={t(`${sc}.filtersTitle`)} description={t(`${sc}.filtersDescription`)}>
        <DashboardToolbar>
          <div className="oh-row-2col min-w-0 w-full">
            <input
              className="input"
              placeholder={t(`${sc}.searchPlaceholder`)}
              value={filters.q}
              onChange={(e) => setFilters((p) => ({ ...p, q: e.target.value }))}
            />
            <div className="oh-row-2col">
              <select className="input" value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
                {claimStatusOptions.map((opt) => (
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
                {payoutStatusOptions.map((opt) => (
                  <option key={opt.value || "all"} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </DashboardToolbar>
      </DashboardSection>

      <DashboardSection title={t(`${sc}.listTitle`)} description={t(`${sc}.listDescription`)}>
        {busy ? (
          <DashboardLoadingState label={t(`${sc}.loading`)}>
            <AdminInlineGridSkeleton count={3} />
          </DashboardLoadingState>
        ) : null}

        {!busy && filteredClaims.length === 0 ? (
          <DashboardEmptyState title={t(`${sc}.emptyTitle`)} description={t(`${sc}.emptyDescription`)} />
        ) : null}

        {!busy && filteredClaims.length > 0 ? (
          <div className="min-w-0 overflow-x-auto">
            <div className="cards-grid cards-grid--max-3">
            {filteredClaims.map((claim) => (
              <article key={claim.id} className="card">
                <h3 style={{ marginTop: 0 }}>{claim.requestTitle}</h3>
                <p>
                  {t(`${sc}.orderNumber`)}: {claim.orderNumber}
                </p>
                <p>
                  {t(`${sc}.freelancer`)}: {freelancerDisplay(claim.freelancer)}
                </p>
                <p style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <span>{t(`${sc}.statusLabel`)}:</span>
                  <StatusBadge tone={claimStatusTone(claim.status)}>{claimStatusLabel(claim.status, t)}</StatusBadge>
                </p>
                <p style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <span>{t(`${sc}.payoutLabel`)}:</span>
                  <StatusBadge tone={payoutStatusTone(claim.payoutStatus)}>
                    {payoutStatusLabel(claim.payoutStatus, t)}
                  </StatusBadge>
                </p>
                <p>
                  {t(`${sc}.freelancerSharePct`)}: {formatPct(claim.userPercentageSnapshot)}
                </p>
                <p>
                  {t(`${sc}.companySharePct`)}: {formatPct(claim.companyPercentageSnapshot)}
                </p>
                <p>
                  {t(`${sc}.freelancerDue`)}: {money(claim.userAmountSnapshot)}
                </p>
                <p>
                  {t(`${sc}.remaining`)}: {money(claim.remainingAmount)}
                </p>
                <div className="actions-row">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setSelectedId(claim.id);
                      loadDetail(claim.id);
                    }}
                  >
                    {t(`${sc}.details`)}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() =>
                      setStatusModal({
                        open: true,
                        claim,
                        status:
                          claim.status === "paid"
                            ? "accepted"
                            : claim.status || "pending",
                        adminNote: claim.adminNote || "",
                      })
                    }
                  >
                    {t(`${sc}.changeStatus`)}
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
                    {t(`${sc}.editPricing`)}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setPaymentModal({ open: true, claim, paymentMethod: "bank_transfer", paymentReference: "", paidAt: "" })}
                  >
                    {t(`${sc}.registerPayment`)}
                  </button>
                </div>
              </article>
            ))}
            </div>
          </div>
        ) : null}
      </DashboardSection>

      {detail ? (
        <DashboardSection
          title={t(`${sc}.detailTitle`, { id: detail.id })}
          description={t(`${sc}.detailDescription`)}
        >
          <div className="card">
            <p>
              {t(`${sc}.requestTitle`)}: {detail.requestTitle}
            </p>
            <p>
              {t(`${sc}.orderNumber`)}: {detail.orderNumber}
            </p>
            <p>
              {t(`${sc}.freelancer`)}: {freelancerDisplay(detail.freelancer)}
            </p>
            <p style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <span>{t(`${sc}.statusLabel`)}:</span>
              <StatusBadge tone={claimStatusTone(detail.status)}>{claimStatusLabel(detail.status, t)}</StatusBadge>
            </p>
            <p style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <span>{t(`${sc}.payoutLabel`)}:</span>
              <StatusBadge tone={payoutStatusTone(detail.payoutStatus)}>
                {payoutStatusLabel(detail.payoutStatus, t)}
              </StatusBadge>
            </p>
            <p>
              {t(`${sc}.freelancerSharePct`)}: {formatPct(detail.userPercentageSnapshot)}
            </p>
            <p>
              {t(`${sc}.companySharePct`)}: {formatPct(detail.companyPercentageSnapshot)}
            </p>
            <p>
              {t(`${sc}.totalPrice`)}: {money(detail.totalPriceSnapshot)}
            </p>
            <p>
              {t(`${sc}.freelancerDue`)}: {money(detail.userAmountSnapshot)}
            </p>
            <p>
              {t(`${sc}.paidAmount`)}: {money(detail.paidAmount)}
            </p>
            <p>
              {t(`${sc}.remaining`)}: {money(detail.remainingAmount)}
            </p>
            <p>
              {t(`${sc}.actualCompletionDate`)}: {formatDate(detail.actualCompletionDate, locale)}
            </p>
          </div>
          <div className="card" style={{ marginTop: 10 }}>
            <h3 style={{ marginTop: 0 }}>{t(`${sc}.timelineTitle`)}</h3>
            {(detail.statusHistory || []).length === 0 ? (
              <p>{t(`${sc}.timelineEmpty`)}</p>
            ) : (
              <ul className="simple-list">
                {detail.statusHistory.map((h) => (
                  <li key={h.id}>
                    {claimStatusLabel(h.oldStatus || "—", t)} ← {claimStatusLabel(h.newStatus, t)} |{" "}
                    {formatDate(h.changedAt, locale)}
                    {h.adminNote ? ` | ${t(`${sc}.timelineNote`)}: ${h.adminNote}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DashboardSection>
      ) : null}

      <DashboardModal
        open={statusModal.open}
        title={t(`${sc}.statusModalTitle`)}
        onClose={closeStatusModal}
        footer={
          <>
            <button type="button" className="btn btn-primary" disabled={actionBusy} onClick={applyStatus}>
              {t("finance.actions.save")}
            </button>
            <button type="button" className="btn btn-secondary" disabled={actionBusy} onClick={closeStatusModal}>
              {t("finance.actions.cancel")}
            </button>
          </>
        }
      >
        <div className="dash-ui-modal__form">
          <select className="input" value={statusModal.status} onChange={(e) => setStatusModal((p) => ({ ...p, status: e.target.value }))}>
            {claimStatusChangeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-sm text-slate-500 m-0">{t(`${sc}.paidStatusHint`)}</p>
          <textarea
            className="textarea"
            placeholder={t(`${sc}.adminNotePlaceholder`)}
            value={statusModal.adminNote}
            onChange={(e) => setStatusModal((p) => ({ ...p, adminNote: e.target.value }))}
          />
        </div>
      </DashboardModal>

      <DashboardModal
        open={pricingModal.open}
        title={t(`${sc}.pricingModalTitle`)}
        onClose={closePricingModal}
        footer={
          <>
            <button type="button" className="btn btn-primary" disabled={actionBusy} onClick={applyPricing}>
              {t("finance.actions.save")}
            </button>
            <button type="button" className="btn btn-secondary" disabled={actionBusy} onClick={closePricingModal}>
              {t("finance.actions.cancel")}
            </button>
          </>
        }
      >
        <div className="dash-ui-modal__form">
          <input
            className="input"
            type="number"
            min="0"
            placeholder={t(`${sc}.totalPricePlaceholder`)}
            value={pricingModal.totalPriceSnapshot}
            onChange={(e) => setPricingModal((p) => ({ ...p, totalPriceSnapshot: e.target.value }))}
          />
          <input
            className="input"
            type="number"
            min="0"
            max="100"
            placeholder={t(`${sc}.freelancerPctPlaceholder`)}
            value={pricingModal.userPercentageSnapshot}
            onChange={(e) => setPricingModal((p) => ({ ...p, userPercentageSnapshot: e.target.value }))}
          />
          <input
            className="input"
            type="number"
            min="0"
            max="100"
            placeholder={t(`${sc}.companyPctPlaceholder`)}
            value={pricingModal.companyPercentageSnapshot}
            onChange={(e) => setPricingModal((p) => ({ ...p, companyPercentageSnapshot: e.target.value }))}
          />
        </div>
      </DashboardModal>

      <DashboardModal
        open={paymentModal.open}
        title={t(`${sc}.paymentModalTitle`)}
        onClose={closePaymentModal}
        footer={
          <>
            <button type="button" className="btn btn-primary" disabled={actionBusy} onClick={registerPayment}>
              {t(`${sc}.confirmPayment`)}
            </button>
            <button type="button" className="btn btn-secondary" disabled={actionBusy} onClick={closePaymentModal}>
              {t("finance.actions.cancel")}
            </button>
          </>
        }
      >
        <div className="dash-ui-modal__form">
          <p className="dash-ui-modal__lead">
            {t(`${sc}.claimRef`)}: #{paymentModal.claim?.id}
          </p>
          <p className="dash-ui-modal__hint">
            {t(`${sc}.remainingAmount`)}: {money(paymentModal.claim?.remainingAmount)}
          </p>
          <input
            className="input"
            placeholder={t(`${sc}.paymentMethodPlaceholder`)}
            value={paymentModal.paymentMethod}
            onChange={(e) => setPaymentModal((p) => ({ ...p, paymentMethod: e.target.value }))}
          />
          <input
            className="input"
            placeholder={t(`${sc}.paymentReferencePlaceholder`)}
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
