import "../../i18n/financeResources";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  approveFazatSettlementRequest,
  adjustAndApproveFazatSettlementRequest,
  listFazatSettlementsRequest,
  rejectFazatSettlementRequest,
} from "../../services/api";
import { useToast } from "../../components/ui/toastContext";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import { useAuth } from "../../context/useAuth";
import { ROLE } from "../../constants/authRoutes";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardToolbar from "../../components/dashboard/DashboardToolbar";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import StatusBadge from "../../components/dashboard/StatusBadge";
import DashboardModal from "../../components/dashboard/DashboardModal";
import { useTranslation } from "../../i18n/LanguageProvider";

function formatDate(value, locale) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  const tag = locale === "en" ? "en-GB" : "ar-JO-u-nu-latn";
  return new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function formatMinor(amountMinor, currency = "JOD", locale) {
  if (amountMinor == null || Number.isNaN(Number(amountMinor))) return "—";
  const major = Number(amountMinor) / 100;
  const tag = locale === "en" ? "en-US" : "ar-JO-u-nu-latn";
  return `${new Intl.NumberFormat(tag, { maximumFractionDigits: 2 }).format(major)} ${currency}`;
}

function statusTone(status) {
  const v = String(status || "");
  if (v === "PENDING_REVIEW") return "pending";
  if (v === "APPROVED_CREDITED" || v === "ADJUSTED_APPROVED") return "success";
  if (v === "REJECTED" || v === "VOIDED") return "danger";
  if (v === "CREDIT_FAILED") return "warning";
  return "neutral";
}

function settlementStatusLabel(status, t) {
  const v = String(status || "");
  const key = `finance.fazatSettlements.settlementStatus.${v}`;
  const label = v ? t(key) : "";
  if (label && label !== key) return label;
  return v || "—";
}

const STATUS_FILTER_VALUES = [
  "",
  "PENDING_REVIEW",
  "APPROVED_CREDITED",
  "ADJUSTED_APPROVED",
  "REJECTED",
  "CREDIT_FAILED",
];

export default function SuperAdminFazatSettlementsPage() {
  const { t, locale } = useTranslation();
  const fs = "finance.fazatSettlements";
  const { pushToast } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = String(user?.role || "") === ROLE.SUPER_ADMIN;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [busyId, setBusyId] = useState(null);

  const [detail, setDetail] = useState(null);
  const [rejectOpen, setRejectOpen] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const statusFilterOptions = useMemo(
    () =>
      STATUS_FILTER_VALUES.map((value) => ({
        value,
        label: value ? settlementStatusLabel(value, t) : t(`${fs}.filterAllStatuses`),
      })),
    [t, fs],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listFazatSettlementsRequest({
        status: statusFilter || undefined,
        limit: 200,
      });
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      pushToast({
        type: "error",
        message: getSafeApiErrorMessage(err, t(`${fs}.toastLoadError`)),
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, pushToast, t, fs]);

  useEffect(() => {
    load();
  }, [load]);

  const pendingCount = useMemo(
    () => rows.filter((r) => r.status === "PENDING_REVIEW").length,
    [rows],
  );

  const onApprove = async (row) => {
    setBusyId(row.id);
    try {
      await approveFazatSettlementRequest(row.id);
      pushToast({ type: "success", message: t(`${fs}.toastApproved`) });
      await load();
    } catch (err) {
      pushToast({
        type: "error",
        message: getSafeApiErrorMessage(err, t(`${fs}.toastApproveError`)),
      });
    } finally {
      setBusyId(null);
    }
  };

  const onReject = async () => {
    if (!rejectOpen) return;
    if (String(rejectReason || "").trim().length < 3) {
      pushToast({ type: "error", message: t(`${fs}.toastRejectReasonRequired`) });
      return;
    }
    setBusyId(rejectOpen.id);
    try {
      await rejectFazatSettlementRequest(rejectOpen.id, { reason: rejectReason.trim() });
      pushToast({ type: "success", message: t(`${fs}.toastRejected`) });
      setRejectOpen(null);
      setRejectReason("");
      await load();
    } catch (err) {
      pushToast({
        type: "error",
        message: getSafeApiErrorMessage(err, t(`${fs}.toastRejectError`)),
      });
    } finally {
      setBusyId(null);
    }
  };

  const onAdjustApprove = async () => {
    if (!adjustOpen) return;
    const major = Number(adjustAmount);
    if (!Number.isFinite(major) || major <= 0) {
      pushToast({ type: "error", message: t(`${fs}.toastInvalidAmount`) });
      return;
    }
    if (String(adjustReason || "").trim().length < 3) {
      pushToast({ type: "error", message: t(`${fs}.toastAdjustReasonRequired`) });
      return;
    }
    const adjustedAmountMinor = Math.round(major * 100);
    setBusyId(adjustOpen.id);
    try {
      await adjustAndApproveFazatSettlementRequest(adjustOpen.id, {
        adjustedAmountMinor,
        reason: adjustReason.trim(),
      });
      pushToast({ type: "success", message: t(`${fs}.toastAdjustedApproved`) });
      setAdjustOpen(null);
      setAdjustAmount("");
      setAdjustReason("");
      await load();
    } catch (err) {
      pushToast({
        type: "error",
        message: getSafeApiErrorMessage(err, t(`${fs}.toastAdjustError`)),
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t(`${fs}.title`)}
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.fazatSettlements")}
        description={t(`${fs}.description`)}
      />

      <DashboardToolbar>
        <div className="oh-row-2col min-w-0 w-full">
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {statusFilterOptions.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
            {t(`${fs}.refresh`, { count: pendingCount })}
          </button>
        </div>
      </DashboardToolbar>

      <DashboardSection title={t(`${fs}.listTitle`)}>
        {loading ? (
          <DashboardLoadingState />
        ) : rows.length === 0 ? (
          <DashboardEmptyState title={t(`${fs}.emptyTitle`)} description={t(`${fs}.emptyDescription`)} />
        ) : (
          <div className="oh-table-wrap">
            <table className="oh-table">
              <thead>
                <tr>
                  <th>{t(`${fs}.colId`)}</th>
                  <th>{t(`${fs}.colFazatRef`)}</th>
                  <th>{t(`${fs}.colOrderzOrder`)}</th>
                  <th>{t(`${fs}.colFreelancer`)}</th>
                  <th>{t(`${fs}.colAmount`)}</th>
                  <th>{t(`${fs}.colFinal`)}</th>
                  <th>{t(`${fs}.colStatus`)}</th>
                  <th>{t(`${fs}.colDate`)}</th>
                  <th>{t(`${fs}.colActions`)}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const canAct =
                    row.status === "PENDING_REVIEW" || row.status === "CREDIT_FAILED";
                  return (
                    <tr key={row.id}>
                      <td>#{row.id}</td>
                      <td>
                        <div className="text-sm">{row.fazatOrderId || "—"}</div>
                        <div className="text-xs opacity-70">{row.fazatSettlementId}</div>
                      </td>
                      <td>{row.orderzOrderId || "—"}</td>
                      <td>
                        <div>{row.freelancerName || "—"}</div>
                        <div className="text-xs opacity-70">#{row.freelancerId}</div>
                      </td>
                      <td>{formatMinor(row.amountMinor, row.currency, locale)}</td>
                      <td>
                        {formatMinor(
                          row.finalAmountMinor ?? row.adjustedAmountMinor ?? row.amountMinor,
                          row.currency,
                          locale,
                        )}
                      </td>
                      <td>
                        <StatusBadge tone={statusTone(row.status)}>
                          {settlementStatusLabel(row.status, t)}
                        </StatusBadge>
                      </td>
                      <td>{formatDate(row.createdAt, locale)}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setDetail(row)}
                          >
                            {t(`${fs}.details`)}
                          </button>
                          {canAct ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-primary"
                                disabled={busyId === row.id}
                                onClick={() => onApprove(row)}
                              >
                                {t(`${fs}.approveCredit`)}
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={busyId === row.id}
                                onClick={() => {
                                  setRejectOpen(row);
                                  setRejectReason("");
                                }}
                              >
                                {t(`${fs}.reject`)}
                              </button>
                              {isSuperAdmin ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  disabled={busyId === row.id}
                                  onClick={() => {
                                    setAdjustOpen(row);
                                    setAdjustAmount(String(Number(row.amountMinor) / 100));
                                    setAdjustReason("");
                                  }}
                                >
                                  {t(`${fs}.adjustApprove`)}
                                </button>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DashboardSection>

      <DashboardModal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={t(`${fs}.detailModalTitle`)}
      >
        {detail ? (
          <div className="space-y-2 text-sm">
            <p>
              <strong>{t(`${fs}.fazatRef`)}:</strong> {detail.fazatOrderId} / {detail.fazatSettlementId}
            </p>
            <p>
              <strong>{t(`${fs}.orderzOrder`)}:</strong> {detail.orderzOrderId || "—"}
            </p>
            <p>
              <strong>{t(`${fs}.colFreelancer`)}:</strong> {detail.freelancerName} (#{detail.freelancerId})
            </p>
            <p>
              <strong>{t(`${fs}.amount`)}:</strong> {formatMinor(detail.amountMinor, detail.currency, locale)}
            </p>
            {detail.adjustedAmountMinor != null ? (
              <p>
                <strong>{t(`${fs}.adjusted`)}:</strong>{" "}
                {formatMinor(detail.adjustedAmountMinor, detail.currency, locale)}
                {detail.adjustmentReason ? ` — ${detail.adjustmentReason}` : ""}
              </p>
            ) : null}
            <p>
              <strong>{t(`${fs}.statusLabel`)}:</strong> {settlementStatusLabel(detail.status, t)}
            </p>
            {detail.rejectionReason ? (
              <p>
                <strong>{t(`${fs}.rejectionReason`)}:</strong> {detail.rejectionReason}
              </p>
            ) : null}
            {detail.walletLedgerEntryId ? (
              <p>
                <strong>{t(`${fs}.walletEntry`)}:</strong> #{detail.walletLedgerEntryId}
              </p>
            ) : null}
            <p className="opacity-70 text-xs">{t(`${fs}.freelancerPrivacyNote`)}</p>
          </div>
        ) : null}
      </DashboardModal>

      <DashboardModal
        open={Boolean(rejectOpen)}
        onClose={() => setRejectOpen(null)}
        title={t(`${fs}.rejectModalTitle`)}
        footer={
          <button
            type="button"
            className="btn btn-primary"
            disabled={busyId === rejectOpen?.id}
            onClick={onReject}
          >
            {t(`${fs}.confirmReject`)}
          </button>
        }
      >
        <label className="block text-sm mb-1">{t(`${fs}.rejectReasonLabel`)}</label>
        <textarea
          className="input w-full"
          rows={3}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder={t(`${fs}.rejectReasonPlaceholder`)}
        />
      </DashboardModal>

      <DashboardModal
        open={Boolean(adjustOpen)}
        onClose={() => setAdjustOpen(null)}
        title={t(`${fs}.adjustModalTitle`)}
        footer={
          <button
            type="button"
            className="btn btn-primary"
            disabled={busyId === adjustOpen?.id}
            onClick={onAdjustApprove}
          >
            {t(`${fs}.adjustApprove`)}
          </button>
        }
      >
        <label className="block text-sm mb-1">
          {t(`${fs}.finalAmountLabel`, { currency: adjustOpen?.currency || "JOD" })}
        </label>
        <input
          type="number"
          min="0.01"
          step="0.01"
          className="input w-full mb-3"
          value={adjustAmount}
          onChange={(e) => setAdjustAmount(e.target.value)}
        />
        <label className="block text-sm mb-1">{t(`${fs}.adjustReasonLabel`)}</label>
        <textarea
          className="input w-full"
          rows={3}
          value={adjustReason}
          onChange={(e) => setAdjustReason(e.target.value)}
        />
      </DashboardModal>
    </DashboardShell>
  );
}
