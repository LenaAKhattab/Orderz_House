import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ToastProvider } from "./components/ui/ToastProvider";
import PublicLayout from "./components/layout/PublicLayout";
import MainLayout from "./layouts/MainLayout";
import { DashboardRedirect, GuestOnly, RequireAuth, RequireRole } from "./components/auth/AuthGuards";
import Home from "./pages/Home";
import About from "./pages/About";
import Services from "./pages/Services";
import Orders from "./pages/Orders";
import Plans from "./pages/Plans";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsConditions from "./pages/TermsConditions";
import Unauthorized from "./pages/Unauthorized";
import DashboardPage from "./pages/dashboard/DashboardPage";
import SuperAdminPlansPage from "./pages/dashboard/SuperAdminPlansPage";
import SuperAdminSubscriptionsPage from "./pages/dashboard/SuperAdminSubscriptionsPage";
import AdminOrdersPage from "./pages/dashboard/AdminOrdersPage";
import AdminCreateOrderPage from "./pages/dashboard/AdminCreateOrderPage";
import ClientCreateOrderPage from "./pages/dashboard/ClientCreateOrderPage";
import FreelancerOrderDetailsPage from "./pages/dashboard/FreelancerOrderDetailsPage";
import FreelancerMyOrderDetailsPage from "./pages/dashboard/FreelancerMyOrderDetailsPage";
import { ROLE } from "./constants/authRoutes";

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/services" element={<Services />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/plans" element={<Plans />} />
              <Route
                path="/login"
                element={
                  <GuestOnly>
                    <Login />
                  </GuestOnly>
                }
              />
              <Route
                path="/register"
                element={
                  <GuestOnly>
                    <Register />
                  </GuestOnly>
                }
              />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms-conditions" element={<TermsConditions />} />
              <Route path="/unauthorized" element={<Unauthorized />} />
            </Route>

            <Route element={<RequireAuth />}>
              <Route element={<MainLayout />}>
                <Route path="/dashboard" element={<DashboardRedirect />} />
                <Route
                  path="/dashboard/super-admin"
                  element={
                    <RequireRole allowedRoles={[ROLE.SUPER_ADMIN]}>
                      <DashboardPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/super-admin/plans"
                  element={
                    <RequireRole allowedRoles={[ROLE.SUPER_ADMIN]}>
                      <SuperAdminPlansPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/super-admin/subscriptions"
                  element={
                    <RequireRole allowedRoles={[ROLE.SUPER_ADMIN]}>
                      <SuperAdminSubscriptionsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/super-admin/orders"
                  element={
                    <RequireRole allowedRoles={[ROLE.SUPER_ADMIN]}>
                      <AdminOrdersPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/super-admin/orders/create"
                  element={
                    <RequireRole allowedRoles={[ROLE.SUPER_ADMIN]}>
                      <AdminCreateOrderPage />
                    </RequireRole>
                  }
                />

                <Route
                  path="/dashboard/admin"
                  element={
                    <RequireRole allowedRoles={[ROLE.ADMIN]}>
                      <DashboardPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/admin/orders"
                  element={
                    <RequireRole allowedRoles={[ROLE.ADMIN]}>
                      <AdminOrdersPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/admin/orders/create"
                  element={
                    <RequireRole allowedRoles={[ROLE.ADMIN]}>
                      <AdminCreateOrderPage />
                    </RequireRole>
                  }
                />

                <Route
                  path="/dashboard/freelancer"
                  element={
                    <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                      <DashboardPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/freelancer/my-orders"
                  element={
                    <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                      <DashboardPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/freelancer/my-orders/:id"
                  element={
                    <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                      <FreelancerMyOrderDetailsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/freelancer/orders"
                  element={
                    <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                      <DashboardPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/freelancer/orders/:id"
                  element={
                    <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                      <FreelancerOrderDetailsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/freelancer/financial-claims"
                  element={
                    <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                      <DashboardPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/client"
                  element={
                    <RequireRole allowedRoles={[ROLE.CLIENT]}>
                      <DashboardPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/client/orders/create"
                  element={
                    <RequireRole allowedRoles={[ROLE.CLIENT]}>
                      <ClientCreateOrderPage />
                    </RequireRole>
                  }
                />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
