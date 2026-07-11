import { Suspense, lazy } from "react";
import { useLocation } from "react-router-dom";
import LazyRouteOutlet from "../components/layout/LazyRouteOutlet";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import RouteSuspenseFallback from "../components/ui/RouteSuspenseFallback";
import { useAuth } from "../context/useAuth";
import { ROLE } from "../constants/authRoutes";
import { isFreelancerDashboardPath } from "../constants/freelancerNav";
import { isClientDashboardShellPath } from "../constants/clientNav";
import { isAdminDashboardPath } from "../constants/adminNav";
import { adminUsesSuperAdminShell } from "../constants/dashboardPermissions";
import { NotificationRealtimeProvider } from "../context/NotificationRealtimeContext.jsx";
import NotificationPermissionPrompt from "../components/notifications/NotificationPermissionPrompt";

const SuperAdminLayout = lazy(() => import("./SuperAdminLayout"));
const AdminLayout = lazy(() => import("./AdminLayout"));
const FreelancerDashboardLayout = lazy(() => import("./FreelancerDashboardLayout"));
const FinancialUserLayout = lazy(() => import("./FinancialUserLayout"));

function DashboardShellSuspense({ children }) {
  return <Suspense fallback={<RouteSuspenseFallback />}>{children}</Suspense>;
}

const MainLayout = () => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const role = user?.primaryRole || user?.role;
  const useSuperShell =
    pathname.startsWith("/dashboard/super-admin") &&
    (role === ROLE.SUPER_ADMIN || (role === ROLE.ADMIN && adminUsesSuperAdminShell(pathname)));
  const useAdminShell = role === ROLE.ADMIN && isAdminDashboardPath(pathname) && !adminUsesSuperAdminShell(pathname);
  const useFreelancerShell = role === ROLE.FREELANCER && isFreelancerDashboardPath(pathname);
  const useClientShell = role === ROLE.CLIENT && isClientDashboardShellPath(pathname);
  const useFinancialUserShell =
    role === ROLE.FINANCIAL_USER &&
    (pathname === "/dashboard/my-bonuses" || pathname.startsWith("/dashboard/financial-user"));

  if (useFinancialUserShell) {
    return (
      <NotificationRealtimeProvider>
        <DashboardShellSuspense>
          <FinancialUserLayout />
        </DashboardShellSuspense>
        {user ? <NotificationPermissionPrompt /> : null}
      </NotificationRealtimeProvider>
    );
  }

  if (useSuperShell) {
    return (
      <NotificationRealtimeProvider>
        <DashboardShellSuspense>
          <SuperAdminLayout />
        </DashboardShellSuspense>
        {user ? <NotificationPermissionPrompt /> : null}
      </NotificationRealtimeProvider>
    );
  }

  if (useAdminShell) {
    return (
      <NotificationRealtimeProvider>
        <DashboardShellSuspense>
          <AdminLayout />
        </DashboardShellSuspense>
        {user ? <NotificationPermissionPrompt /> : null}
      </NotificationRealtimeProvider>
    );
  }

  if (useFreelancerShell || useClientShell) {
    return (
      <NotificationRealtimeProvider>
        <div className="page-shell bg-page-bg">
          <DashboardShellSuspense>
            <FreelancerDashboardLayout />
          </DashboardShellSuspense>
        </div>
        {user ? <NotificationPermissionPrompt /> : null}
      </NotificationRealtimeProvider>
    );
  }

  return (
    <NotificationRealtimeProvider>
      <div className="page-shell bg-page-bg">
        <Navbar />
        <main className="app-shell">
          <LazyRouteOutlet />
        </main>
        <Footer />
      </div>
      {user ? <NotificationPermissionPrompt /> : null}
    </NotificationRealtimeProvider>
  );
};

export default MainLayout;
