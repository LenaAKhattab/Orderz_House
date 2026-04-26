import { Outlet, useLocation } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import SuperAdminLayout from "./SuperAdminLayout";
import { useAuth } from "../context/useAuth";
import { ROLE } from "../constants/authRoutes";

const MainLayout = () => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const role = user?.primaryRole || user?.role;
  const useSuperShell = role === ROLE.SUPER_ADMIN && pathname.startsWith("/dashboard/super-admin");

  if (useSuperShell) {
    return <SuperAdminLayout />;
  }

  return (
    <div className="page-shell">
      <Navbar />
      <main className="app-shell">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};

export default MainLayout;
