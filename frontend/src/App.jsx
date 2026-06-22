import { Suspense, lazy, useEffect, useRef } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigationType } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ToastProvider } from "./components/ui/ToastProvider";
import { useToast } from "./components/ui/toastContext";
import RouteSuspenseFallback from "./components/ui/RouteSuspenseFallback";
import ScrollToTop from "./components/routing/ScrollToTop";
import DocumentTitle from "./components/routing/DocumentTitle";
import LocaleTransitionOverlay from "./components/layout/LocaleTransitionOverlay";
import PublicLayout from "./components/layout/PublicLayout";
import Home from "./pages/Home";

const MainLayout = lazy(() => import("./layouts/MainLayout"));
import { ClientCreateOrderModalProvider } from "./context/ClientCreateOrderModalContext.jsx";
import {
  DashboardRedirect,
  GuestOnly,
  HomeForGuestsOnly,
  RequireAuth,
  RequirePermission,
  RequireRole,
  RequireStaffPage,
} from "./components/auth/AuthGuards";
import { ADMIN_PAGE_PERMISSIONS, SUPER_ADMIN_PAGE_PERMISSIONS } from "./constants/dashboardPermissions";
import {
  About,
  Services,
  Plans,
  Orders,
  Login,
  Register,
  ForgotPassword,
  PrivacyPolicy,
  TermsConditions,
  PublicGuaranteePage,
  PublicHelpCenterPage,
  PublicEnterprisePage,
  PublicFindWorkPage,
  PublicCommunityPage,
  PublicBlogPage,
  Unauthorized,
  NotFoundPage,
  DashboardPage,
  SuperAdminPlansPage,
  SuperAdminPlanPagesPage,
  SuperAdminSubscriptionsPage,
  SuperAdminFinancialClaimsPage,
  SuperAdminSettingsPage,
  SuperAdminAdminsPage,
  SuperAdminEditWebsitePage,
  SuperAdminEditWebsiteFaqPage,
  SuperAdminSitePagesPage,
  SuperAdminSitePageEditPage,
  SuperAdminEditWebsiteHowItWorksPage,
  SuperAdminEditWebsiteHowItWorksEditorPage,
  HowItWorksFreelancerPage,
  HowItWorksClientPage,
  AdminOrdersPage,
  AdminCreateOrderPage,
  AdminSubscriptionsActivationPage,
  AdminCoursesPage,
  AdminAdsPage,
  TrainingOrdersAdminShell,
  TrainingOrdersOverviewPage,
  TrainingOrdersSettingsPage,
  TrainingOrderTemplatesPage,
  TrainingOrderRoundsPage,
  TrainingOrderApplicationsPage,
  ClientCreateOrderOpenAndRedirect,
  ClientMyOrdersPage,
  ClientFinancialPage,
  ClientProfilePage,
  ClientSettingsPage,
  FreelancerOrderDetailsPage,
  FreelancerMyOrderDetailsPage,
  FreelancerFinancialClaimsPage,
  FreelancerPlansPage,
  FreelancerCoursesPage,
  FreelancerCourseDetailsPage,
  FreelancerSettingsPage,
  NotificationsPage,
} from "./routes/lazyPages";
import { ROLE } from "./constants/authRoutes";
import { useAuth } from "./context/useAuth";
import { clearAnalyticsUser, initAnalytics, runAnalyticsStartupChecks, setAnalyticsUser, trackPageView } from "./services/analytics";
import {
  clearGuestPoolLoginToastFlag,
  isGuestPoolLoginToast,
} from "./utils/guestPoolLoginToast";

function AnalyticsBridge() {
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    runAnalyticsStartupChecks();
    initAnalytics();
  }, []);

  useEffect(() => {
    const fullPath = `${location.pathname || "/"}${location.search || ""}${location.hash || ""}`;
    trackPageView(fullPath, document?.title || "");
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (user?.id != null) {
      setAnalyticsUser(user);
      return;
    }
    clearAnalyticsUser();
  }, [user]);

  return null;
}

/** Clears guest pool login toasts when returning to the marketplace (incl. bfcache back). */
function ToastGuestPoolBridge() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const { dismissMatching } = useToast();
  const prevPathRef = useRef(location.pathname);

  useEffect(() => {
    const prev = prevPathRef.current;
    const next = location.pathname;
    prevPathRef.current = next;

    const isPoolList = (pathname) =>
      pathname === "/orders" ||
      pathname === "/dashboard/freelancer/orders" ||
      pathname === "/dashboard/client/orders";

    if (isPoolList(next) && (navigationType === "POP" || prev === "/login")) {
      dismissMatching(isGuestPoolLoginToast);
      clearGuestPoolLoginToastFlag();
    }
  }, [location.pathname, navigationType, dismissMatching]);

  return null;
}

/** يزيل الإشعارات العالقة عند مغادرة لوحة التحكم (مثل أخطاء لا تُغلق تلقائيًا). */
function ToastDashboardExitBridge() {
  const location = useLocation();
  const { clear } = useToast();
  const prevPathRef = useRef(location.pathname);

  useEffect(() => {
    const prev = prevPathRef.current;
    const next = location.pathname;
    prevPathRef.current = next;
    if (prev.startsWith("/dashboard") && !next.startsWith("/dashboard")) {
      clear();
    }
  }, [location.pathname, clear]);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <DocumentTitle />
      <LocaleTransitionOverlay />
      <ToastProvider>
        <AuthProvider>
          <AnalyticsBridge />
          <ToastDashboardExitBridge />
          <ToastGuestPoolBridge />
          <Routes>
            <Route element={<PublicLayout />}>
              <Route
                path="/"
                element={
                  <HomeForGuestsOnly>
                    <Home />
                  </HomeForGuestsOnly>
                }
              />
              <Route path="/about" element={<About />} />
              <Route path="/services" element={<Services />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/plans" element={<Plans />} />
              <Route path="/plans/:slug" element={<Plans />} />
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
              <Route path="/guarantee" element={<PublicGuaranteePage />} />
              <Route path="/help-center" element={<PublicHelpCenterPage />} />
              <Route path="/enterprise" element={<PublicEnterprisePage />} />
              <Route path="/find-work" element={<PublicFindWorkPage />} />
              <Route path="/community" element={<PublicCommunityPage />} />
              <Route path="/blog" element={<PublicBlogPage />} />
              <Route path="/how-it-works/freelancer" element={<HowItWorksFreelancerPage />} />
              <Route path="/how-it-works/client" element={<HowItWorksClientPage />} />
              <Route path="/unauthorized" element={<Unauthorized />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>

            <Route element={<RequireAuth />}>
              <Route
                element={
                  <Suspense fallback={<RouteSuspenseFallback />}>
                    <ClientCreateOrderModalProvider>
                      <MainLayout />
                    </ClientCreateOrderModalProvider>
                  </Suspense>
                }
              >
                <Route path="/dashboard" element={<DashboardRedirect />} />
                <Route
                  path="/dashboard/super-admin"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.overview}>
                      <DashboardPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/plan-pages"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.plans}>
                      <SuperAdminPlanPagesPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/plans"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.plans}>
                      <SuperAdminPlansPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/subscriptions"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.subscriptions}>
                      <SuperAdminSubscriptionsPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/subscriptions/activation"
                  element={
                    <RequireStaffPage permission={ADMIN_PAGE_PERMISSIONS.subscriptionActivation}>
                      <AdminSubscriptionsActivationPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/financial-claims"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.financialClaims}>
                      <SuperAdminFinancialClaimsPage />
                    </RequireStaffPage>
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
                  path="/dashboard/super-admin/settings"
                  element={
                    <RequireRole allowedRoles={[ROLE.SUPER_ADMIN]}>
                      <SuperAdminSettingsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/super-admin/courses"
                  element={
                    <RequireStaffPage permission={ADMIN_PAGE_PERMISSIONS.courses}>
                      <AdminCoursesPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/ads"
                  element={
                    <RequireStaffPage permission={ADMIN_PAGE_PERMISSIONS.ads}>
                      <AdminAdsPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/orders"
                  element={
                    <RequireStaffPage permission={ADMIN_PAGE_PERMISSIONS.orders}>
                      <AdminOrdersPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/orders/create"
                  element={
                    <RequireStaffPage permission={ADMIN_PAGE_PERMISSIONS.createOrder}>
                      <AdminCreateOrderPage />
                    </RequireStaffPage>
                  }
                />

                <Route
                  path="/dashboard/super-admin/admins"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.adminsManage}>
                      <SuperAdminAdminsPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/edit-website"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.editWebsite}>
                      <SuperAdminEditWebsitePage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/edit-website/faq"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.editWebsite}>
                      <SuperAdminEditWebsiteFaqPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/edit-website/pages"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.editWebsite}>
                      <SuperAdminSitePagesPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/edit-website/pages/:id"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.editWebsite}>
                      <SuperAdminSitePageEditPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/edit-website/how-it-works/:slug"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.editWebsite}>
                      <SuperAdminEditWebsiteHowItWorksEditorPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/edit-website/how-it-works"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.editWebsite}>
                      <SuperAdminEditWebsiteHowItWorksPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/training-orders"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.trainingOrders}>
                      <TrainingOrdersAdminShell />
                    </RequireStaffPage>
                  }
                >
                  <Route index element={<TrainingOrdersOverviewPage />} />
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
                      <RequirePermission permission={ADMIN_PAGE_PERMISSIONS.orders}>
                        <AdminOrdersPage />
                      </RequirePermission>
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/admin/orders/create"
                  element={
                    <RequireRole allowedRoles={[ROLE.ADMIN]}>
                      <RequirePermission permission={ADMIN_PAGE_PERMISSIONS.createOrder}>
                        <AdminCreateOrderPage />
                      </RequirePermission>
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/admin/subscriptions"
                  element={
                    <RequireRole allowedRoles={[ROLE.ADMIN]}>
                      <RequirePermission permission={ADMIN_PAGE_PERMISSIONS.subscriptionActivation}>
                        <AdminSubscriptionsActivationPage />
                      </RequirePermission>
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/admin/courses"
                  element={
                    <RequireRole allowedRoles={[ROLE.ADMIN]}>
                      <RequirePermission permission={ADMIN_PAGE_PERMISSIONS.courses}>
                        <AdminCoursesPage />
                      </RequirePermission>
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/admin/ads"
                  element={
                    <RequireRole allowedRoles={[ROLE.ADMIN]}>
                      <RequirePermission permission={ADMIN_PAGE_PERMISSIONS.ads}>
                        <AdminAdsPage />
                      </RequirePermission>
                    </RequireRole>
                  }
                />

                <Route
                  path="/dashboard/freelancer/orders"
                  element={
                    <RequireRole allowedRoles={[ROLE.FREELANCER, ROLE.CLIENT]}>
                      <DashboardPage />
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
                  path="/dashboard/freelancer/settings"
                  element={
                    <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                      <FreelancerSettingsPage />
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
                    <RequireRole allowedRoles={[ROLE.FREELANCER, ROLE.CLIENT]}>
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
                  path="/dashboard/freelancer/plans"
                  element={
                    <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                      <FreelancerPlansPage />
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
                  path="/dashboard/client/profile"
                  element={
                    <RequireRole allowedRoles={[ROLE.CLIENT]}>
                      <ClientProfilePage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/client/settings"
                  element={
                    <RequireRole allowedRoles={[ROLE.CLIENT]}>
                      <ClientSettingsPage />
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
                <Route
                  path="/dashboard/client/orders"
                  element={
                    <RequireRole allowedRoles={[ROLE.CLIENT]}>
                      <DashboardPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/client/orders/:id"
                  element={
                    <RequireRole allowedRoles={[ROLE.CLIENT]}>
                      <FreelancerOrderDetailsPage />
                    </RequireRole>
                  }
                />
                <Route path="/dashboard/*" element={<NotFoundPage />} />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
