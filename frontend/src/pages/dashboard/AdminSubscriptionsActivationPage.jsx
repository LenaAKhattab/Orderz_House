import { useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import { breadcrumbHomeFromUser, superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { activateSubscriptionCompanyRequest, listSubscriptionsRequest } from "../../services/api";
import { useAuth } from "../../context/useAuth";
import { AdminInlineGridSkeleton } from "../../components/ui/Skeleton";

function errorMessage(err) {
  return err?.response?.data?.message || "تعذر تنفيذ العملية. حاول مجدداً.";
}

function formatJoDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", {
    timeZone: "Asia/Amman",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function fullNameAr(user) {
  const parts = [user?.firstName, user?.fatherName, user?.familyName].filter(Boolean);
  return parts.join(" ").trim();
}

export default function AdminSubscriptionsActivationPage() {
  const { user } = useAuth();
  const role = user?.primaryRole || user?.role;
  const isSuperAdmin = role === "super_admin";
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState(null);
  const [error, setError] = useState("");
  const [subs, setSubs] = useState([]);

  const refresh = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await listSubscriptionsRequest({});
      setSubs(res?.data?.subscriptions || []);
    } catch (err) {
      setError(errorMessage(err));
      setSubs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const pendingCompanyActivation = useMemo(() => {
    return (subs || []).filter((s) => {
      const payment = String(s?.paymentStatus || "");
      const activation = String(s?.activationStatus || "");
      const eligiblePaymentState =
        payment === "paid" ||
        payment === "pending" ||
        payment === "not_required" ||
        payment === "";
      return activation === "company_pending" && eligiblePaymentState;
    });
  }, [subs]);

  const activate = async (subscriptionId) => {
    setError("");
    setSubmittingId(String(subscriptionId));
    try {
      await activateSubscriptionCompanyRequest(subscriptionId);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmittingId(null);
    }
  };

  const breadcrumbs = isSuperAdmin
    ? superAdminBreadcrumbs("تفعيل الاشتراكات")
    : [
        { label: "الرئيسية", href: breadcrumbHomeFromUser(user) },
        { label: "تفعيل الاشتراكات" },
      ];

  return (
    <DashboardShell>
      <DashboardPageHeader
        eyebrow={isSuperAdmin ? "لوحة المدير الأعلى" : "لوحة التحكم"}
        title="تفعيل اشتراكات المستقلين"
        description="يمكنك تفعيل الحسابات المشتركة بعد مراجعة الشركة، ليصبح المستقل مؤهلاً لاستلام الطلبات."
        breadcrumbs={breadcrumbs}
        alert={error ? <p className="auth-form-error">{error}</p> : null}
      />

      <DashboardSection title="بانتظار تفعيل الشركة">
        {loading ? <AdminInlineGridSkeleton count={3} /> : null}
        {!loading && pendingCompanyActivation.length === 0 ? (
          <p>لا توجد اشتراكات بانتظار التفعيل حالياً.</p>
        ) : null}

        {!loading && pendingCompanyActivation.length > 0 ? (
          <div className="cards-grid">
            {pendingCompanyActivation.map((s) => (
              <article className="card" key={s.id}>
                <h3>اشتراك #{s.id}</h3>
                <p>الاسم: {fullNameAr(s?.freelancer) || "—"}</p>
                <p>البريد: {s?.freelancer?.email || "—"}</p>
                <p>account_id: {s?.freelancer?.accountId || "—"}</p>
                <p>planId: {s.planId}</p>
                <p>حالة الدفع: {s.paymentStatus || "—"}</p>
                <p>حالة التفعيل: {s.activationStatus || "—"}</p>
                <p>assignedAt: {formatJoDateTime(s.assignedAt)}</p>
                <p>paidAt: {formatJoDateTime(s.paidAt)}</p>
                <div className="auth-actions-row auth-actions-row--split" style={{ marginTop: 10 }}>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={submittingId === String(s.id)}
                    onClick={() => activate(s.id)}
                  >
                    {submittingId === String(s.id) ? "جارٍ التفعيل..." : "تفعيل الآن"}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </DashboardSection>
    </DashboardShell>
  );
}

