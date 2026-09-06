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

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function formatMinor(amountMinor, currency = "JOD") {
  if (amountMinor == null || Number.isNaN(Number(amountMinor))) return "—";
  const major = Number(amountMinor) / 100;
  return `${new Intl.NumberFormat("ar-JO-u-nu-latn", { maximumFractionDigits: 2 }).format(major)} ${currency}`;
}

function statusTone(status) {
  const v = String(status || "");
  if (v === "PENDING_REVIEW") return "pending";
  if (v === "APPROVED_CREDITED" || v === "ADJUSTED_APPROVED") return "success";
  if (v === "REJECTED" || v === "VOIDED") return "danger";
  if (v === "CREDIT_FAILED") return "warning";
  return "neutral";
}

export default function SuperAdminFazatSettlementsPage() {
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
        message: getSafeApiErrorMessage(err, "تعذر تحميل تسويات فزعات"),
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, pushToast]);

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
      pushToast({ type: "success", message: "تم الاعتماد وإضافة الرصيد للمحفظة" });
      await load();
    } catch (err) {
      pushToast({
        type: "error",
        message: getSafeApiErrorMessage(err, "تعذر اعتماد التسوية"),
      });
    } finally {
      setBusyId(null);
    }
  };

  const onReject = async () => {
    if (!rejectOpen) return;
    if (String(rejectReason || "").trim().length < 3) {
      pushToast({ type: "error", message: "يجب إدخال سبب الرفض." });
      return;
    }
    setBusyId(rejectOpen.id);
    try {
      await rejectFazatSettlementRequest(rejectOpen.id, { reason: rejectReason.trim() });
      pushToast({ type: "success", message: "تم رفض التسوية" });
      setRejectOpen(null);
      setRejectReason("");
      await load();
    } catch (err) {
      pushToast({
        type: "error",
        message: getSafeApiErrorMessage(err, "تعذر رفض التسوية"),
      });
    } finally {
      setBusyId(null);
    }
  };

  const onAdjustApprove = async () => {
    if (!adjustOpen) return;
    const major = Number(adjustAmount);
    if (!Number.isFinite(major) || major <= 0) {
      pushToast({ type: "error", message: "لا يمكن اعتماد مبلغ صفر أو أقل." });
      return;
    }
    if (String(adjustReason || "").trim().length < 3) {
      pushToast({ type: "error", message: "يجب إدخال سبب التعديل." });
      return;
    }
    const adjustedAmountMinor = Math.round(major * 100);
    setBusyId(adjustOpen.id);
    try {
      await adjustAndApproveFazatSettlementRequest(adjustOpen.id, {
        adjustedAmountMinor,
        reason: adjustReason.trim(),
      });
      pushToast({ type: "success", message: "تم تعديل المبلغ واعتماد التسوية" });
      setAdjustOpen(null);
      setAdjustAmount("");
      setAdjustReason("");
      await load();
    } catch (err) {
      pushToast({
        type: "error",
        message: getSafeApiErrorMessage(err, "تعذر تعديل واعتماد التسوية"),
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardShell>
      <DashboardPageHeader
        title="تسويات فزعات"
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.fazatSettlements")}
        description="مراجعة تسويات أرباح الفريلانسر القادمة من فزعات قبل إضافة الرصيد إلى محفظة Orderz."
      />

      <DashboardToolbar>
        <div className="oh-row-2col min-w-0 w-full">
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">كل الحالات</option>
            <option value="PENDING_REVIEW">بانتظار المراجعة</option>
            <option value="APPROVED_CREDITED">معتمد وتمت إضافة الرصيد</option>
            <option value="ADJUSTED_APPROVED">معدل ومعتمد</option>
            <option value="REJECTED">مرفوض</option>
            <option value="CREDIT_FAILED">فشل إضافة الرصيد</option>
          </select>
          <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
            تحديث ({pendingCount} بانتظار)
          </button>
        </div>
      </DashboardToolbar>

      <DashboardSection title="قائمة التسويات">
        {loading ? (
          <DashboardLoadingState />
        ) : rows.length === 0 ? (
          <DashboardEmptyState title="لا توجد تسويات" description="لم تصل أي تسويات من فزعات بعد." />
        ) : (
          <div className="oh-table-wrap">
            <table className="oh-table">
              <thead>
                <tr>
                  <th>المعرّف</th>
                  <th>مرجع فزعات</th>
                  <th>طلب Orderz</th>
                  <th>الفريلانسر</th>
                  <th>المبلغ</th>
                  <th>النهائي</th>
                  <th>الحالة</th>
                  <th>التاريخ</th>
                  <th>إجراءات</th>
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
                      <td>{formatMinor(row.amountMinor, row.currency)}</td>
                      <td>
                        {formatMinor(
                          row.finalAmountMinor ?? row.adjustedAmountMinor ?? row.amountMinor,
                          row.currency,
                        )}
                      </td>
                      <td>
                        <StatusBadge tone={statusTone(row.status)}>
                          {row.statusLabelAr || row.status}
                        </StatusBadge>
                      </td>
                      <td>{formatDate(row.createdAt)}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setDetail(row)}
                          >
                            تفاصيل
                          </button>
                          {canAct ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-primary"
                                disabled={busyId === row.id}
                                onClick={() => onApprove(row)}
                              >
                                اعتماد وإضافة للمحفظة
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
                                رفض التسوية
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
                                  تعديل المبلغ واعتماد
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
        title="تفاصيل تسوية فزعات"
      >
        {detail ? (
          <div className="space-y-2 text-sm">
            <p>
              <strong>مرجع فزعات:</strong> {detail.fazatOrderId} / {detail.fazatSettlementId}
            </p>
            <p>
              <strong>طلب Orderz:</strong> {detail.orderzOrderId || "—"}
            </p>
            <p>
              <strong>الفريلانسر:</strong> {detail.freelancerName} (#{detail.freelancerId})
            </p>
            <p>
              <strong>المبلغ:</strong> {formatMinor(detail.amountMinor, detail.currency)}
            </p>
            {detail.adjustedAmountMinor != null ? (
              <p>
                <strong>المعدل:</strong>{" "}
                {formatMinor(detail.adjustedAmountMinor, detail.currency)}
                {detail.adjustmentReason ? ` — ${detail.adjustmentReason}` : ""}
              </p>
            ) : null}
            <p>
              <strong>الحالة:</strong> {detail.statusLabelAr}
            </p>
            {detail.rejectionReason ? (
              <p>
                <strong>سبب الرفض:</strong> {detail.rejectionReason}
              </p>
            ) : null}
            {detail.walletLedgerEntryId ? (
              <p>
                <strong>قيد المحفظة:</strong> #{detail.walletLedgerEntryId}
              </p>
            ) : null}
            <p className="opacity-70 text-xs">
              لا يظهر للفريلانسر أي إشارة لفزعات — يرى فقط «أرباح طلب مُدار».
            </p>
          </div>
        ) : null}
      </DashboardModal>

      <DashboardModal
        open={Boolean(rejectOpen)}
        onClose={() => setRejectOpen(null)}
        title="رفض التسوية"
        footer={
          <button
            type="button"
            className="btn btn-primary"
            disabled={busyId === rejectOpen?.id}
            onClick={onReject}
          >
            تأكيد الرفض
          </button>
        }
      >
        <label className="block text-sm mb-1">سبب الرفض</label>
        <textarea
          className="input w-full"
          rows={3}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="سبب واضح للمراجعة المالية…"
        />
      </DashboardModal>

      <DashboardModal
        open={Boolean(adjustOpen)}
        onClose={() => setAdjustOpen(null)}
        title="تعديل المبلغ واعتماد"
        footer={
          <button
            type="button"
            className="btn btn-primary"
            disabled={busyId === adjustOpen?.id}
            onClick={onAdjustApprove}
          >
            تعديل المبلغ واعتماد
          </button>
        }
      >
        <label className="block text-sm mb-1">المبلغ النهائي ({adjustOpen?.currency || "JOD"})</label>
        <input
          type="number"
          min="0.01"
          step="0.01"
          className="input w-full mb-3"
          value={adjustAmount}
          onChange={(e) => setAdjustAmount(e.target.value)}
        />
        <label className="block text-sm mb-1">سبب التعديل</label>
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
