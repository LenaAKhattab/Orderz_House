import { Outlet, useLocation } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import SuperAdminLayout from "./SuperAdminLayout";
import { useAuth } from "../context/useAuth";
import { ROLE } from "../constants/authRoutes";
import { NotificationRealtimeProvider } from "../context/NotificationRealtimeContext.jsx";
import NotificationPermissionPrompt from "../components/notifications/NotificationPermissionPrompt";

const MainLayout = () => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const role = user?.primaryRole || user?.role;
  const useSuperShell = role === ROLE.SUPER_ADMIN && pathname.startsWith("/dashboard/super-admin");

  if (useSuperShell) {
    return (
      <NotificationRealtimeProvider>
        <SuperAdminLayout />
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
