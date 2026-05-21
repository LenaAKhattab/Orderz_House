import { Outlet, useLocation } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import SuperAdminLayout from "./SuperAdminLayout";
import FreelancerDashboardLayout from "./FreelancerDashboardLayout";
import { useAuth } from "../context/useAuth";
import { ROLE } from "../constants/authRoutes";
import { isFreelancerDashboardPath } from "../constants/freelancerNav";
import { isClientDashboardShellPath } from "../constants/clientNav";
import { NotificationRealtimeProvider } from "../context/NotificationRealtimeContext.jsx";
import NotificationPermissionPrompt from "../components/notifications/NotificationPermissionPrompt";

const MainLayout = () => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const role = user?.primaryRole || user?.role;
  const useSuperShell = role === ROLE.SUPER_ADMIN && pathname.startsWith("/dashboard/super-admin");
  const useFreelancerShell = role === ROLE.FREELANCER && isFreelancerDashboardPath(pathname);
  const useClientShell = role === ROLE.CLIENT && isClientDashboardShellPath(pathname);

  if (useSuperShell) {
    return (
      <NotificationRealtimeProvider>
        <SuperAdminLayout />
        {user ? <NotificationPermissionPrompt /> : null}
      </NotificationRealtimeProvider>
    );
  }

  if (useFreelancerShell || useClientShell) {
    return (
      <NotificationRealtimeProvider>
        <div className="page-shell bg-page-bg">
          <FreelancerDashboardLayout />
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
          <Outlet />
        </main>
        <Footer />
      </div>
      {user ? <NotificationPermissionPrompt /> : null}
    </NotificationRealtimeProvider>
  );
};

export default MainLayout;
