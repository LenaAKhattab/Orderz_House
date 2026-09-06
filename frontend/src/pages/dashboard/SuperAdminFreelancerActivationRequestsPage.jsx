import { useCallback, useEffect, useState, useRef } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { adminBreadcrumbs, superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import {
  listSuperAdminFreelancerActivationRequestsRequest,
  getSuperAdminFreelancerActivationRequestRequest,
  approveSuperAdminFreelancerActivationRequestRequest,
  rejectSuperAdminFreelancerActivationRequestRequest,
  fetchSuperAdminFreelancerActivationKycFileBlob,
} from "../../services/api";
import { isAdminStaffShell, staffIdentityRequestsPath } from "../../lib/staff/staffDashboardPaths";
import { ADMIN_LIST_SEARCH_DEBOUNCE_MS } from "../../lib/staff/adminListLoad";
import { useAdminListLoad } from "../../hooks/useAdminListLoad";
import "./kycActivationReviewActions.css";

const STATUS_LABELS = {
  pending_review: "قيد المراجعة",
  approved: "مقبول",
  rejected: "مرفوض",
  draft: "مسودة",
  cancelled: "ملغى",
};

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("ar-JO");
  } catch {
    return String(value);
  }
}

function kycImageErrorMessage(err) {
  if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError" || err?.name === "AbortError") {
    return "";
  }
  const status = err?.response?.status;
  if (status === 404) return "لم يتم العثور على صورة الهوية.";
  if (status === 401 || status === 403) return "ليست لديك صلاحية لعرض هذه الصورة.";
  if (status === 502 || status === 503) return "تعذر تحميل صورة الهوية الآن. حاول مرة أخرى.";
  const fromApi = getSafeApiErrorMessage(err, "");
  if (fromApi && fromApi !== "تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مجدداً.") {
    return fromApi;
  }
  if (status >= 400) return "تعذر تحميل صورة الهوية الآن. حاول مرة أخرى.";
  return "تعذر تحميل صورة الهوية الآن. حاول مرة أخرى.";
}

function KycImage({ requestId, side, label }) {
  const [src, setSrc] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    const controller = new AbortController();
    setSrc("");
    setErr("");
    (async () => {
      try {
        const blob = await fetchSuperAdminFreelancerActivationKycFileBlob(requestId, side, {
          signal: controller.signal,
        });
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setSrc(objectUrl);
      } catch (e) {
        if (!active || e?.code === "ERR_CANCELED" || e?.name === "CanceledError" || e?.name === "AbortError") {
          return;
        }
        setErr(kycImageErrorMessage(e));
      }
    })();
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [requestId, side]);

  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>{label}</h3>
      {err ? <p style={{ color: "#b91c1c" }}>{err}</p> : null}
      {src ? (
        <img
          src={src}
          alt={label}
          style={{ maxWidth: "100%", maxHeight: 360, borderRadius: 8, border: "1px solid #e5e7eb" }}
        />
      ) : !err ? (
        <p style={{ color: "#6b7280" }}>جارٍ التحميل…</p>
      ) : null}
    </div>
  );
}

function RequestDetail({ id, onBack }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getSuperAdminFreelancerActivationRequestRequest(id);
      setPayload(res?.data ?? null);
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || "تعذر تحميل الطلب.");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const request = payload?.request;
  const freelancer = payload?.freelancer;
  const pending = request?.status === "pending_review";

  const handleApprove = async () => {
    if (!pending || busy) return;
    setBusy(true);
    setActionError("");
    try {
      await approveSuperAdminFreelancerActivationRequestRequest(id);
      await load();
    } catch (err) {
      setActionError(getSafeApiErrorMessage(err) || "تعذر قبول الطلب.");
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!pending || busy) return;
    if (!String(rejectionReason || "").trim()) {
      setActionError("سبب الرفض مطلوب.");
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      await rejectSuperAdminFreelancerActivationRequestRequest(id, {
        rejectionReason: rejectionReason.trim(),
        adminNotes: adminNotes.trim() || undefined,
      });
      await load();
    } catch (err) {
      setActionError(getSafeApiErrorMessage(err) || "تعذر رفض الطلب.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <DashboardLoadingState />;
  if (error) return <DashboardErrorState message={error} onRetry={() => void load()} />;
  if (!request) return <DashboardEmptyState title="الطلب غير موجود" />;

  return (
    <DashboardSection title={`طلب #${request.id}`}>
      <button type="button" className="oh-account-btn-ghost" onClick={onBack} style={{ marginBottom: 12 }}>
        العودة للقائمة
      </button>

      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <div>
          <strong>المستقل:</strong> {freelancer?.name || "—"} ({freelancer?.email || "—"})
        </div>
        <div>
          <strong>الحالة:</strong> {STATUS_LABELS[request.status] || request.status}
        </div>
        <div>
          <strong>تاريخ الإرسال:</strong> {formatDate(request.submittedAt)}
        </div>
        <div>
          <strong>الموافقة على الشروط:</strong> {formatDate(request.termsAcceptedAt)} —{" "}
          {request.termsVersion || "—"}
        </div>
        {request.reviewedAt ? (
          <div>
            <strong>تاريخ المراجعة:</strong> {formatDate(request.reviewedAt)}
          </div>
        ) : null}
        {request.rejectionReason ? (
          <div>
            <strong>سبب الرفض:</strong> {request.rejectionReason}
          </div>
        ) : null}
        {request.adminNotes ? (
          <div>
            <strong>ملاحظات داخلية:</strong> {request.adminNotes}
          </div>
        ) : null}
      </div>

      <KycImage requestId={request.id} side="front" label="صورة الهوية الأمامية" />
      <KycImage requestId={request.id} side="back" label="صورة الهوية الخلفية" />

      {pending ? (
        <div style={{ marginTop: 16, display: "grid", gap: 12, maxWidth: 520 }}>
          <label>
            سبب الرفض
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
              style={{ width: "100%", marginTop: 6 }}
              disabled={busy}
            />
          </label>
          <label>
            ملاحظات داخلية
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={2}
              style={{ width: "100%", marginTop: 6 }}
              disabled={busy}
            />
          </label>
          {actionError ? <p style={{ color: "#b91c1c", margin: 0 }}>{actionError}</p> : null}
          <div className="kyc-review-actions">
            <button
              type="button"
              className="kyc-review-btn kyc-review-btn--approve"
              disabled={busy}
              onClick={() => void handleApprove()}
            >
              قبول التفعيل
            </button>
            <button
              type="button"
              className="kyc-review-btn kyc-review-btn--reject"
              disabled={busy}
              onClick={() => void handleReject()}
            >
              رفض التفعيل
            </button>
          </div>
        </div>
      ) : null}
    </DashboardSection>
  );
}

export default function SuperAdminFreelancerActivationRequestsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const listBase = staffIdentityRequestsPath(pathname);
  const crumbs = isAdminStaffShell(pathname)
    ? adminBreadcrumbs("dashboard.breadcrumbs.identityVerification")
    : superAdminBreadcrumbs("dashboard.breadcrumbs.freelancerActivationRequests");
  const [items, setItems] = useState([]);
  const [statusFilter, setStatusFilter] = useState("pending_review");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const itemsLenRef = useRef(0);
  itemsLenRef.current = items.length;
  const {
    initialLoading,
    refreshing,
    initialLoadError,
    refreshError,
    rateLimited,
    run: runListLoad,
  } = useAdminListLoad({
    mapError: (err) => getSafeApiErrorMessage(err) || "تعذر تحميل طلبات التفعيل.",
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), ADMIN_LIST_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    const result = await runListLoad(
      ({ signal }) =>
        listSuperAdminFreelancerActivationRequestsRequest(
          {
            status: statusFilter || undefined,
            search: debouncedSearch || undefined,
            limit: 50,
          },
          { signal },
        ),
      { hasExistingRows: itemsLenRef.current > 0 },
    );
    if (result.ok) {
      setItems(result.data?.data?.items || []);
    }
  }, [runListLoad, statusFilter, debouncedSearch]);

  useEffect(() => {
    if (id) return;
    void load();
  }, [id, load]);

  const controlsDisabled = refreshing || rateLimited;
  return (
    <DashboardShell>
      <DashboardPageHeader
        title={isAdminStaffShell(pathname) ? "طلبات توثيق الهوية" : "طلبات تفعيل المستقلين"}
        subtitle="مراجعة صور الهوية والموافقة أو الرفض"
        crumbs={crumbs}
      />

      {id ? (
        <RequestDetail id={id} onBack={() => navigate(listBase)} />
      ) : (
        <DashboardSection title="القائمة">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              disabled={controlsDisabled}
            >
              <option value="pending_review">قيد المراجعة</option>
              <option value="approved">مقبول</option>
              <option value="rejected">مرفوض</option>
              <option value="">الكل</option>
            </select>
            <input
              type="search"
              placeholder="بحث بالاسم أو البريد"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="البحث عن مستقل"
              disabled={rateLimited}
              data-testid="admin-identity-search"
            />
            <button
              type="button"
              onClick={() => void load()}
              disabled={controlsDisabled || (initialLoading && items.length === 0)}
              data-testid="admin-identity-refresh"
            >
              تحديث
            </button>
            {refreshing ? (
              <span style={{ color: "#64748b", fontSize: "0.875rem" }} data-testid="admin-list-refreshing">
                {searchInput.trim() ? "جاري البحث..." : "جاري التحديث..."}
              </span>
            ) : null}
            {rateLimited ? (
              <span style={{ color: "#b45309", fontSize: "0.875rem" }} data-testid="admin-list-rate-limit-cooldown">
                انتظر قليلاً ثم حاول مجددًا…
              </span>
            ) : null}
          </div>

          {refreshError ? (
            <p
              role="status"
              data-testid="admin-list-refresh-soft-note"
              style={{ color: "#b45309", margin: "0 0 12px", fontSize: "0.9rem" }}
            >
              {refreshError}
            </p>
          ) : null}

          {initialLoading && items.length === 0 ? <DashboardLoadingState /> : null}
          {initialLoadError && items.length === 0 ? (
            <DashboardErrorState message={initialLoadError} onRetry={() => void load()} />
          ) : null}
          {!initialLoading && !initialLoadError && items.length === 0 ? (
            <DashboardEmptyState title="لا توجد طلبات" />
          ) : null}
          {items.length > 0 ? (
            <div style={{ overflowX: "auto" }} data-testid="admin-identity-table">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="right">المستقل</th>
                    <th align="right">البريد</th>
                    <th align="right">الحالة</th>
                    <th align="right">تاريخ الإرسال</th>
                    <th align="right">المراجعة</th>
                    <th align="right">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id}>
                      <td>{row.freelancerName || "—"}</td>
                      <td>{row.freelancerEmail || "—"}</td>
                      <td>{STATUS_LABELS[row.status] || row.status}</td>
                      <td>{formatDate(row.submittedAt)}</td>
                      <td>{formatDate(row.reviewedAt)}</td>
                      <td>
                        <Link to={`${listBase}/${row.id}`}>عرض</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </DashboardSection>
      )}
    </DashboardShell>
  );
}
