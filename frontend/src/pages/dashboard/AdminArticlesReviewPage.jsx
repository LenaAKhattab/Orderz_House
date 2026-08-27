import { useLocation } from "react-router-dom";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import MarketplaceArticlesAdminPanel from "../../components/admin/MarketplaceArticlesAdminPanel";
import { adminBreadcrumbs, superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { isAdminStaffShell } from "../../lib/staff/staffDashboardPaths";

/**
 * Articles review / follow-up — Flutter Super Admin action parity for Web Admin.
 * Excludes activation fund/inventory automation (super_admin-only).
 */
export default function AdminArticlesReviewPage() {
  const { pathname } = useLocation();
  const crumbs = isAdminStaffShell(pathname)
    ? adminBreadcrumbs("dashboard.breadcrumbs.articles")
    : superAdminBreadcrumbs("dashboard.breadcrumbs.articles");

  return (
    <DashboardShell>
      <DashboardPageHeader
        title="المقالات"
        subtitle="مراجعة المقالات التي تحتاج متابعة أو قراراً"
        crumbs={crumbs}
      />
      <MarketplaceArticlesAdminPanel />
    </DashboardShell>
  );
}
