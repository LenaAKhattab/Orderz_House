import DashboardShell from "../../components/dashboard/DashboardShell";
import SuperAdminProductAnalytics from "../../components/analytics/super-admin/SuperAdminProductAnalytics";

/** Super Admin home — product analytics (PostHog + DB). */
export default function SuperAdminVisitorsDashboard() {
  return (
    <DashboardShell>
      <div className="flex min-h-0 w-full min-w-0 flex-col">
        <SuperAdminProductAnalytics />
      </div>
    </DashboardShell>
  );
}
