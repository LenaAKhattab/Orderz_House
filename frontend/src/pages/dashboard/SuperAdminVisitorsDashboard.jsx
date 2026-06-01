import DashboardShell from "../../components/dashboard/DashboardShell";
import SuperAdminProductAnalytics from "../../components/analytics/super-admin/SuperAdminProductAnalytics";

/** Super Admin home — management control center. */
export default function SuperAdminVisitorsDashboard() {
  return (
    <DashboardShell>
      <div className="flex min-h-0 w-full min-w-0 flex-col">
        <SuperAdminProductAnalytics />
      </div>
    </DashboardShell>
  );
}
