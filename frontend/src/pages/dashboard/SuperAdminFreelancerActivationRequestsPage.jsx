import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import {
  listSuperAdminFreelancerActivationRequestsRequest,
  getSuperAdminFreelancerActivationRequestRequest,
  approveSuperAdminFreelancerActivationRequestRequest,
  rejectSuperAdminFreelancerActivationRequestRequest,
  fetchSuperAdminFreelancerActivationKycFileBlob,
} from "../../services/api";

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

function KycImage({ requestId, side, label }) {
  const [src, setSrc] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let revoked = false;
    let objectUrl = "";
    (async () => {
      try {
        const blob = await fetchSuperAdminFreelancerActivationKycFileBlob(requestId, side);
        objectUrl = URL.createObjectURL(blob);
        if (!revoked) setSrc(objectUrl);
      } catch (e) {
        if (!revoked) setErr(getSafeApiErrorMessage(e) || "تعذر عرض الصورة");
      }
    })();
    return () => {
      revoked = true;
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" className="oh-account-btn-primary" disabled={busy} onClick={() => void handleApprove()}>
              قبول التفعيل
            </button>
            <button type="button" className="oh-account-btn-ghost" disabled={busy} onClick={() => void handleReject()}>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [statusFilter, setStatusFilter] = useState("pending_review");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listSuperAdminFreelancerActivationRequestsRequest({
        status: statusFilter || undefined,
        search: search.trim() || undefined,
        limit: 50,
      });
      setItems(res?.data?.items || []);
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || "تعذر تحميل طلبات التفعيل.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    if (id) return;
    void load();
  }, [id, load]);

  return (
    <DashboardShell>
      <DashboardPageHeader
        title="طلبات تفعيل المستقلين"
        subtitle="مراجعة صور الهوية والموافقة أو الرفض"
        crumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.freelancerActivationRequests")}
      />

      {id ? (
        <RequestDetail id={id} onBack={() => navigate("/dashboard/super-admin/freelancer-activation-requests")} />
      ) : (
        <DashboardSection title="القائمة">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="pending_review">قيد المراجعة</option>
              <option value="approved">مقبول</option>
              <option value="rejected">مرفوض</option>
              <option value="">الكل</option>
            </select>
            <input
              type="search"
              placeholder="بحث بالاسم أو البريد"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="button" onClick={() => void load()}>
              تحديث
            </button>
          </div>

          {loading ? <DashboardLoadingState /> : null}
          {error ? <DashboardErrorState message={error} onRetry={() => void load()} /> : null}
          {!loading && !error && items.length === 0 ? (
            <DashboardEmptyState title="لا توجد طلبات" />
          ) : null}
          {!loading && !error && items.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
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
                        <Link to={`/dashboard/super-admin/freelancer-activation-requests/${row.id}`}>
                          عرض
                        </Link>
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
