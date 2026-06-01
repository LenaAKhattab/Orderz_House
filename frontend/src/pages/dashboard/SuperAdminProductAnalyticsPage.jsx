import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import SuperAdminProductAnalyticsInsights from "../../components/analytics/super-admin/SuperAdminProductAnalyticsInsights";
import "../../components/analytics/super-admin/super-admin-analytics.css";

/** Super Admin product analytics — events, conversion, top pages. */
export default function SuperAdminProductAnalyticsPage() {
  return (
    <DashboardShell>
      <div className="sa-analytics w-full min-w-0 text-start">
        <DashboardPageHeader
          eyebrow="لوحة المدير الأعلى"
          title="تحليلات المنتج"
          description="متابعة سلوك المستخدمين، الأحداث، التحويل، وأكثر الصفحات مشاهدة."
          breadcrumbs={superAdminBreadcrumbs("تحليلات المنتج")}
        />
        <SuperAdminProductAnalyticsInsights />
      </div>
    </DashboardShell>
  );
}
