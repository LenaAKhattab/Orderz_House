import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ToastProvider } from "./components/ui/ToastProvider";
import PublicLayout from "./components/layout/PublicLayout";
import MainLayout from "./layouts/MainLayout";
import { ClientCreateOrderModalProvider } from "./context/ClientCreateOrderModalContext.jsx";
import { DashboardRedirect, GuestOnly, RequireAuth, RequireRole } from "./components/auth/AuthGuards";
import Home from "./pages/Home";
import About from "./pages/About";
import Services from "./pages/Services";
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
import ClientCreateOrderOpenAndRedirect from "./pages/dashboard/ClientCreateOrderOpenAndRedirect";
import ClientMyOrdersPage from "./pages/dashboard/ClientMyOrdersPage";
import ClientFinancialPage from "./pages/dashboard/ClientFinancialPage";
import FreelancerOrderDetailsPage from "./pages/dashboard/FreelancerOrderDetailsPage";
import FreelancerMyOrderDetailsPage from "./pages/dashboard/FreelancerMyOrderDetailsPage";
import FreelancerFinancialClaimsPage from "./pages/dashboard/FreelancerFinancialClaimsPage";
import SuperAdminFinancialClaimsPage from "./pages/dashboard/SuperAdminFinancialClaimsPage";
import AdminSubscriptionsActivationPage from "./pages/dashboard/AdminSubscriptionsActivationPage";
import NotificationsPage from "./pages/dashboard/NotificationsPage";
import AdminCoursesPage from "./pages/dashboard/AdminCoursesPage";
import TrainingOrdersAdminShell, {
  TrainingOrdersIndexRedirect,
} from "./pages/dashboard/trainingOrders/TrainingOrdersAdminShell";
import TrainingOrdersSettingsPage from "./pages/dashboard/trainingOrders/TrainingOrdersSettingsPage";
import TrainingOrderTemplatesPage from "./pages/dashboard/trainingOrders/TrainingOrderTemplatesPage";
import TrainingOrderRoundsPage from "./pages/dashboard/trainingOrders/TrainingOrderRoundsPage";
import TrainingOrderApplicationsPage from "./pages/dashboard/trainingOrders/TrainingOrderApplicationsPage";
import FreelancerCoursesPage from "./pages/dashboard/FreelancerCoursesPage";
import FreelancerCourseDetailsPage from "./pages/dashboard/FreelancerCourseDetailsPage";
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
              <Route path="/orders" element={<Navigate to="/dashboard/freelancer/orders" replace />} />
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

            <Route
              element={
                <ClientCreateOrderModalProvider>
                  <MainLayout />
                </ClientCreateOrderModalProvider>
              }
            >
              <Route path="/dashboard/freelancer/orders" element={<DashboardPage />} />
            </Route>

            <Route element={<RequireAuth />}>
              <Route
                element={
                  <ClientCreateOrderModalProvider>
                    <MainLayout />
                  </ClientCreateOrderModalProvider>
                }
              >
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
                  path="/dashboard/super-admin/subscriptions/activation"
                  element={
                    <RequireRole allowedRoles={[ROLE.SUPER_ADMIN]}>
                      <AdminSubscriptionsActivationPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/super-admin/financial-claims"
                  element={
                    <RequireRole allowedRoles={[ROLE.SUPER_ADMIN]}>
                      <SuperAdminFinancialClaimsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/super-admin/notifications"
                  element={
                    <RequireRole allowedRoles={[ROLE.SUPER_ADMIN]}>
                      <NotificationsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/super-admin/courses"
                  element={
                    <RequireRole allowedRoles={[ROLE.SUPER_ADMIN]}>
                      <AdminCoursesPage />
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
                  path="/dashboard/super-admin/training-orders"
                  element={
                    <RequireRole allowedRoles={[ROLE.SUPER_ADMIN]}>
                      <TrainingOrdersAdminShell />
                    </RequireRole>
                  }
                >
                  <Route index element={<TrainingOrdersIndexRedirect />} />
                  <Route path="settings" element={<TrainingOrdersSettingsPage />} />
                  <Route path="templates" element={<TrainingOrderTemplatesPage />} />
                  <Route path="rounds" element={<TrainingOrderRoundsPage />} />
                  <Route path="applications" element={<TrainingOrderApplicationsPage />} />
                </Route>

                <Route
                  path="/dashboard/admin"
                  element={
                    <RequireRole allowedRoles={[ROLE.ADMIN]}>
                      <DashboardPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/admin/notifications"
                  element={
                    <RequireRole allowedRoles={[ROLE.ADMIN]}>
                      <NotificationsPage />
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
                  path="/dashboard/admin/subscriptions"
                  element={
                    <RequireRole allowedRoles={[ROLE.ADMIN]}>
                      <AdminSubscriptionsActivationPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/admin/courses"
                  element={
                    <RequireRole allowedRoles={[ROLE.ADMIN]}>
                      <AdminCoursesPage />
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
                  path="/dashboard/freelancer/notifications"
                  element={
                    <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                      <NotificationsPage />
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
                      <FreelancerFinancialClaimsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/freelancer/courses"
                  element={
                    <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                      <FreelancerCoursesPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/freelancer/courses/:id"
                  element={
                    <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                      <FreelancerCourseDetailsPage />
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
                <Route path="/dashboard/client/my_orders" element={<Navigate to="/dashboard/client/my-orders" replace />} />
                <Route
                  path="/dashboard/client/notifications"
                  element={
                    <RequireRole allowedRoles={[ROLE.CLIENT]}>
                      <NotificationsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/client/my-orders"
                  element={
                    <RequireRole allowedRoles={[ROLE.CLIENT]}>
                      <ClientMyOrdersPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/client/financial"
                  element={
                    <RequireRole allowedRoles={[ROLE.CLIENT]}>
                      <ClientFinancialPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/client/orders/create"
                  element={
                    <RequireRole allowedRoles={[ROLE.CLIENT]}>
                      <ClientCreateOrderOpenAndRedirect />
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
