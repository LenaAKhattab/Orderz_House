import { useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import { breadcrumbHomeCrumb, superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { activateSubscriptionCompanyRequest, listSubscriptionsRequest } from "../../services/api";
import { useAuth } from "../../context/useAuth";
import { AdminInlineGridSkeleton } from "../../components/ui/Skeleton";
import { formatSubscriptionPaymentCountry } from "../../utils/countryDisplay";

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

function planLabel(s) {
  if (s?.plan?.title) return s.plan.title;
  if (s?.planId != null && String(s.planId).trim() !== "") return `الباقة #${String(s.planId)}`;
  return "—";
}

function paymentStatusLabel(status) {
  const p = String(status || "").trim().toLowerCase();
  if (p === "pending") return "قيد الانتظار";
  if (p === "paid") return "مدفوع";
  if (p === "not_required") return "لا يتطلب دفعاً";
  if (p === "failed" || p === "unpaid") return "غير مكتمل";
  return status || "—";
}

function activationStatusLabel(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "company_pending") return "بانتظار تفعيل الشركة";
  if (s === "company_approved") return "مفعّل";
  if (s === "company_rejected") return "مرفوض";
  return status || "—";
}

function paymentDateLabel(s) {
  const payment = String(s?.paymentStatus || "").trim().toLowerCase();
  if (s?.paidAt) return formatJoDateTime(s.paidAt);
  if (payment === "pending") return "بانتظار الدفع";
  if (payment === "not_required") return "لا يتطلب دفعاً";
  if (payment === "paid") return "تم الدفع (الوقت غير مسجل)";
  return "—";
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
    ? superAdminBreadcrumbs("dashboard.breadcrumbs.subscriptionActivation")
    : [
        breadcrumbHomeCrumb(user),
        { labelKey: "dashboard.breadcrumbs.subscriptionActivation" },
      ];

  return (
    <DashboardShell>
      <DashboardPageHeader
        eyebrow={isSuperAdmin ? "لوحة المدير الأعلى" : "لوحة التحكم"}
        title="تفعيل اشتراكات المستقلين"
        description="يمكنك تفعيل الحسابات المشتركة بعد مراجعة الشركة، ليصبح المستقل مؤهلاً لاستلام الطلبات."
        breadcrumbs={breadcrumbs}
        alert={
          error ? (
            <div className="auth-actions-row" style={{ flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <p className="auth-form-error" style={{ margin: 0 }}>
                {error}
              </p>
              <Button type="button" variant="secondary" onClick={() => void refresh()}>
                إعادة المحاولة
              </Button>
            </div>
          ) : null
        }
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
                <p>
                  الاسم: {fullNameAr(s?.freelancer) || "—"}
                  <span className="block text-sm font-semibold text-slate-500" style={{ marginTop: 4 }}>
                    {formatSubscriptionPaymentCountry({
                      countryCode: s.paymentCountryCode,
                      paymentStatus: s.paymentStatus,
                    })}
                  </span>
                </p>
                <p>البريد: {s?.freelancer?.email || "—"}</p>
                <p>الباقة: {planLabel(s)}</p>
                <p>حالة الدفع: {paymentStatusLabel(s.paymentStatus)}</p>
                <p>حالة التفعيل: {activationStatusLabel(s.activationStatus)}</p>
                <p>تاريخ الإسناد: {formatJoDateTime(s.assignedAt)}</p>
                <p>تاريخ الدفع: {paymentDateLabel(s)}</p>
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

