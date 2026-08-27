import { Link, useLocation } from "react-router-dom";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import { isAdminStaffShell } from "../../lib/staff/staffDashboardPaths";

/**
 * Web-Admin-A2 — Manual subscription activation is obsolete.
 * Paid packages activate via Stripe webhook; STARTER trial starts from the freelancer
 * account after KYC + training. Routes kept for bookmarks/legacy deep links.
 */
export default function AdminSubscriptionsActivationPage() {
  const { pathname } = useLocation();
  const homeTo = isAdminStaffShell(pathname) ? "/dashboard/admin" : "/dashboard/super-admin";

  return (
    <DashboardShell data-testid="membership-activation-deprecated">
      <DashboardPageHeader
        title="تفعيل الاشتراكات"
        subtitle="هذه الصفحة لم تعد جزءاً من مهام الإدارة اليومية"
      />
      <DashboardSection>
        <p style={{ margin: "0 0 12px", lineHeight: 1.7, maxWidth: "42rem" }}>
          لم تعد هذه الصفحة مستخدمة في النظام الجديد. الاشتراكات المدفوعة تُفعّل تلقائيًا عبر
          Stripe، والتجربة المجانية تبدأ من حساب المستقل بعد توثيق الهوية وإكمال التدريب.
        </p>
        <p style={{ margin: "0 0 16px", lineHeight: 1.7, maxWidth: "42rem", color: "#475569" }}>
          لم تعد هذه الصفحة مستخدمة؛ يتم تفعيل الاشتراكات المدفوعة تلقائيًا عبر الدفع.
        </p>
        <Link className="btn btn-primary" to={homeTo} data-testid="membership-activation-back-home">
          العودة إلى لوحة التحكم
        </Link>
      </DashboardSection>
    </DashboardShell>
  );
}
