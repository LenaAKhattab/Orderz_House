import { useCallback, useEffect, useMemo, useState } from "react";
import { adminCancelTrainingRoundRequest, adminListTrainingRoundsRequest } from "../../../services/api";
import DashboardSection from "../../../components/dashboard/DashboardSection";
import DashboardToolbar from "../../../components/dashboard/DashboardToolbar";
import DashboardLoadingState from "../../../components/dashboard/DashboardLoadingState";
import DashboardEmptyState from "../../../components/dashboard/DashboardEmptyState";
import StatusBadge from "../../../components/dashboard/StatusBadge";
import { formatRoundPeriod, getRoundStatusLabel, roundSourceAr } from "./trainingOrdersDisplayUtils";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "./trainingOrdersAdmin.css";

function errMsg(e) {
  return e?.response?.data?.message || e?.message || "حدث خطأ.";
}

function roundStatusTone(status) {
  if (status === "active") return "success";
  if (status === "scheduled") return "pending";
  if (status === "expired") return "inactive";
  if (status === "stopped") return "warning";
  return "neutral";
}

export default function TrainingOrderRoundsPage() {
  const { t, locale } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [rounds, setRounds] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [statusFilter, setStatusFilter] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await adminListTrainingRoundsRequest({
        page,
        limit: 20,
        status: statusFilter || undefined,
      });
      const payload = res?.data ?? res;
      setRounds(payload?.rounds || []);
      setPagination(payload?.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const cancel = async (r) => {
    if (!window.confirm(t("trainingOrders.rounds.cancelConfirm", { title: r.title }))) return;
    setBusyId(r.id);
    setError("");
    try {
      await adminCancelTrainingRoundRequest(r.id);
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = useMemo(() => Math.max(1, pagination?.totalPages || 1), [pagination]);

  return (
    <DashboardSection
      className="oh-training-page-section"
      title={t("trainingOrders.rounds.title")}
      description={t("trainingOrders.rounds.description")}
    >
      {error ? <p className="auth-form-error">{error}</p> : null}
      <DashboardToolbar className="oh-training-filters">
          <label>
            حالة الجولة
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">الكل</option>
              <option value="scheduled">مجدولة</option>
              <option value="active">نشطة</option>
              <option value="expired">منتهية</option>
              <option value="stopped">متوقفة</option>
            </select>
          </label>
        </DashboardToolbar>
        {loading ? (
          <DashboardLoadingState label="جاري التحميل…" />
        ) : rounds.length === 0 ? (
          <DashboardEmptyState title="لا توجد جولات مسجّلة بعد." />
        ) : (
          <div className="oh-training-table-wrap">
            <table className="oh-training-table">
              <thead>
                <tr>
                  <th>العنوان</th>
                  <th>المصدر</th>
                  <th>الحالة</th>
                  <th>النطاق</th>
                  <th>عدد الطلبات</th>
                  <th>الفترة</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rounds.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.title}</strong>
                    </td>
                    <td>{roundSourceAr(r.roundSource)}</td>
                    <td>
                      <StatusBadge tone={roundStatusTone(r.status)}>{getRoundStatusLabel(r.status, t)}</StatusBadge>
                    </td>
                    <td dir="ltr">
                      {r.minOrders} – {r.maxOrders}
                    </td>
                    <td dir="ltr">{r.generatedCount}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{formatRoundPeriod(r.startsAt, r.expiresAt, locale)}</td>
                    <td>
                      {r.status === "active" || r.status === "scheduled" ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={busyId === r.id}
                          onClick={() => cancel(r)}
                        >
                          {busyId === r.id ? "…" : "إيقاف"}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DashboardToolbar className="oh-training-pagination">
          <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            السابق
          </button>
          <span className="help">
            صفحة {page} من {totalPages}
          </span>
          <button type="button" className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            التالي
          </button>
        </DashboardToolbar>
      </DashboardSection>
  );
}
