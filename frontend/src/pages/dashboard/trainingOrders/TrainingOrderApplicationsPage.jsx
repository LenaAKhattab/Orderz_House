import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  adminListTrainingApplicationsByFakeOrderRequest,
  adminListTrainingApplicationsSummaryRequest,
  getCategoriesRequest,
} from "../../../services/api";
import DashboardSection from "../../../components/dashboard/DashboardSection";
import DashboardToolbar from "../../../components/dashboard/DashboardToolbar";
import DashboardLoadingState from "../../../components/dashboard/DashboardLoadingState";
import DashboardEmptyState from "../../../components/dashboard/DashboardEmptyState";
import StatusBadge from "../../../components/dashboard/StatusBadge";
import "./trainingOrdersAdmin.css";

function errMsg(e) {
  return e?.response?.data?.message || e?.message || "حدث خطأ.";
}

const ROUND_STATUS_AR = {
  scheduled: "مجدولة",
  active: "نشطة",
  expired: "منتهية",
  stopped: "متوقفة",
};

const FAKE_ORDER_STATUS_AR = {
  active: "نشط",
  expired: "منتهٍ",
  stopped: "متوقف",
};

function roundStatusTone(status) {
  if (status === "active") return "success";
  if (status === "scheduled") return "pending";
  if (status === "expired") return "inactive";
  if (status === "stopped") return "warning";
  return "neutral";
}

function fakeOrderStatusTone(status) {
  if (status === "active") return "success";
  if (status === "expired") return "inactive";
  if (status === "stopped") return "warning";
  return "neutral";
}

export default function TrainingOrderApplicationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [categories, setCategories] = useState([]);

  const [roundId, setRoundId] = useState("");
  const [fakeOrderId, setFakeOrderId] = useState(() => searchParams.get("fakeOrderId") || "");
  const [categoryId, setCategoryId] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalFakeOrderId, setModalFakeOrderId] = useState(null);
  const [modalTitle, setModalTitle] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [modalApps, setModalApps] = useState([]);

  useEffect(() => {
    const q = searchParams.get("fakeOrderId");
    if (q != null && q !== fakeOrderId) setFakeOrderId(q);
  }, [searchParams, fakeOrderId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getCategoriesRequest();
        const body = res?.data ?? res;
        const list = Array.isArray(body?.data) ? body.data : [];
        if (!cancelled) setCategories(list);
      } catch {
        if (!cancelled) setCategories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const fromQuery = searchParams.get("fakeOrderId") || "";
      const fakeId = String(fromQuery || fakeOrderId).trim() || undefined;
      const params = {
        page,
        limit: 20,
        roundId: roundId.trim() || undefined,
        fakeOrderId: fakeId,
        categoryId: categoryId || undefined,
      };
      const res = await adminListTrainingApplicationsSummaryRequest(params);
      const payload = res?.data ?? res;
      setRows(payload?.fakeOrders || []);
      setPagination(payload?.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (e) {
      setError(errMsg(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, roundId, fakeOrderId, categoryId, searchParams]);

  useEffect(() => {
    load();
  }, [load]);

  const applyFilters = () => {
    const next = new URLSearchParams(searchParams);
    const v = fakeOrderId.trim();
    if (v) next.set("fakeOrderId", v);
    else next.delete("fakeOrderId");
    setSearchParams(next, { replace: true });
    setPage(1);
  };

  const openApplicantsModal = async (row) => {
    setModalOpen(true);
    setModalFakeOrderId(row.fakeOrderId);
    setModalTitle(row.title || `طلب #${row.fakeOrderId}`);
    setModalError("");
    setModalApps([]);
    setModalLoading(true);
    try {
      const res = await adminListTrainingApplicationsByFakeOrderRequest(row.fakeOrderId);
      const payload = res?.data ?? res;
      setModalApps(payload?.applications || []);
    } catch (e) {
      setModalError(errMsg(e));
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalFakeOrderId(null);
    setModalTitle("");
    setModalApps([]);
    setModalError("");
  };

  const totalPages = useMemo(() => Math.max(1, pagination?.totalPages || 1), [pagination]);

  return (
    <>
      <DashboardSection
        className="oh-training-page-section"
        title="متقدمو الطلبات التجريبية"
        description="قائمة بالطلبات الوهمية التي تلقّت تقديماً — اختر «عرض المتقدمين» لرؤية أسماء المستقلين وتفاصيل العروض. لا يشمل طلبات المعرض الحقيقي."
      >
        {error ? <p className="auth-form-error">{error}</p> : null}
        <DashboardToolbar className="oh-training-filters">
          <label>
            رقم الطلب التجريبي
            <input value={fakeOrderId} onChange={(e) => setFakeOrderId(e.target.value)} dir="ltr" title="معرّف السجل" />
          </label>
          <label>
            رقم الجولة
            <input value={roundId} onChange={(e) => setRoundId(e.target.value)} placeholder="مثال: 12" dir="ltr" />
          </label>
          <label>
            التصنيف
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">الكل</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-primary" onClick={applyFilters}>
            تصفية
          </button>
        </DashboardToolbar>

        {loading ? (
          <DashboardLoadingState label="جاري التحميل…" />
        ) : rows.length === 0 ? (
          <DashboardEmptyState title="لا توجد طلبات تجريبية بمتقدمين ضمن المرشحات." />
        ) : (
          <div className="oh-training-table-wrap">
            <table className="oh-training-table">
              <thead>
                <tr>
                  <th>رقم الطلب</th>
                  <th>العنوان</th>
                  <th>التصنيف</th>
                  <th>الجولة</th>
                  <th>الحالة (جولة / طلب)</th>
                  <th>عدد المتقدمين</th>
                  <th>التاريخ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.fakeOrderId}>
                    <td dir="ltr">#{r.fakeOrderId}</td>
                    <td>
                      <strong>{r.title || "—"}</strong>
                    </td>
                    <td>{r.categoryName || "—"}</td>
                    <td>
                      <div>{r.roundTitle || "—"}</div>
                      <div className="help" dir="ltr">
                        #{r.roundId}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
                        <StatusBadge tone={roundStatusTone(r.roundStatus)}>
                          جولة: {ROUND_STATUS_AR[r.roundStatus] || r.roundStatus || "—"}
                        </StatusBadge>
                        <StatusBadge tone={fakeOrderStatusTone(r.fakeOrderStatus)}>
                          طلب: {FAKE_ORDER_STATUS_AR[r.fakeOrderStatus] || r.fakeOrderStatus || "—"}
                        </StatusBadge>
                      </div>
                    </td>
                    <td>
                      <strong>{r.applicantsCount}</strong>
                    </td>
                    <td style={{ whiteSpace: "nowrap", fontSize: "0.82rem" }}>
                      <div>إنشاء الطلب: {r.orderCreatedAt ? new Date(r.orderCreatedAt).toLocaleString("ar-JO") : "—"}</div>
                      {r.lastApplicationAt ? (
                        <div className="help" style={{ marginTop: 4 }}>
                          آخر تقديم: {new Date(r.lastApplicationAt).toLocaleString("ar-JO")}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <button type="button" className="btn btn-secondary" onClick={() => openApplicantsModal(r)}>
                        عرض المتقدمين
                      </button>
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
            صفحة {page} من {totalPages} — إجمالي طلبات بمتقدمين: {pagination?.total ?? 0}
          </span>
          <button type="button" className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            التالي
          </button>
        </DashboardToolbar>

        {modalOpen ? (
          <div
            className="oh-training-modal-overlay"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeModal();
            }}
          >
            <div className="oh-training-modal oh-training-modal--applicants oh-training-modal__card" role="dialog" aria-modal="true" aria-labelledby="training-apps-modal-title">
              <div className="oh-training-modal__head">
                <div>
                  <h3 id="training-apps-modal-title" className="oh-training-modal__title">
                    المتقدمون على الطلب التجريبي
                  </h3>
                  <p className="help" style={{ margin: "6px 0 0" }}>
                    {modalTitle} <span dir="ltr">#{modalFakeOrderId}</span>
                  </p>
                </div>
                <button type="button" className="btn btn-secondary oh-training-modal__close" onClick={closeModal}>
                  إغلاق
                </button>
              </div>

              {modalLoading ? (
                <DashboardLoadingState label="جاري تحميل المتقدمين…" rows={3} />
              ) : modalError ? (
                <p className="auth-form-error">{modalError}</p>
              ) : modalApps.length === 0 ? (
                <DashboardEmptyState title="لا يوجد متقدمون لهذا الطلب." />
              ) : (
                <div className="oh-training-table-wrap" style={{ marginTop: 0 }}>
                  <table className="oh-training-table">
                    <thead>
                      <tr>
                        <th>المتقدم</th>
                        <th>رقم الحساب</th>
                        <th>الباقة</th>
                        <th>المبلغ</th>
                        <th>رسالة التقديم</th>
                        <th>تاريخ التقديم</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalApps.map((a) => (
                        <tr key={a.id}>
                          <td>{a.freelancerName || "—"}</td>
                          <td dir="ltr">{a.accountId || a.freelancerUserId}</td>
                          <td>{a.planTitle || "—"}</td>
                          <td dir="ltr">{a.amount != null ? `${a.amount} JOD` : "—"}</td>
                          <td style={{ maxWidth: 220, wordBreak: "break-word" }}>{a.proposalMessage || "—"}</td>
                          <td style={{ whiteSpace: "nowrap" }}>{a.createdAt ? new Date(a.createdAt).toLocaleString("ar-JO") : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </DashboardSection>
    </>
  );
}
