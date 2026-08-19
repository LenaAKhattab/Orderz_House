import { Suspense, lazy, useEffect, useRef } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigationType } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import { CurrencyDisplayProvider } from "./context/CurrencyDisplayContext.jsx";
import { ToastProvider } from "./components/ui/ToastProvider";
import { useToast } from "./components/ui/toastContext";
import RouteSuspenseFallback from "./components/ui/RouteSuspenseFallback";
import ScrollToTop from "./components/routing/ScrollToTop";
import DocumentTitle from "./components/routing/DocumentTitle";
import LocaleTransitionOverlay from "./components/layout/LocaleTransitionOverlay";
import PublicLayout from "./components/layout/PublicLayout";
import Unauthorized from "./pages/Unauthorized";

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
  Home,
  About,
  Services,
  Plans,
  Orders,
  Login,
  Register,
  ForgotPassword,
  PrivacyPolicy,
  TermsConditions,
  AccountDeletion,
  PublicGuaranteePage,
  PublicHelpCenterPage,
  PublicFindWorkPage,
  PublicCommunityPage,
  PublicBlogPage,
  NotFoundPage,
  DashboardPage,
  SuperAdminPlansPage,
  SuperAdminMarketplacePlansPage,
  SuperAdminTrainingPackagesPage,
  SuperAdminMarketplaceEconomyPage,
  SuperAdminMarketplaceArticlesPage,
  SuperAdminBildazoAuthorLinksPage,
  SuperAdminBidCreditsPage,
  SuperAdminAnalysisPage,
  SuperAdminSubscriptionsPage,
  SuperAdminFinancialClaimsPage,
  SuperAdminFinancialCenterPage,
  FinancialEmployeeDetailPage,
  SuperAdminSettingsPage,
  SuperAdminAdminsPage,
  SuperAdminRateLimitExemptionsPage,
  SuperAdminFeedbackPage,
  SuperAdminFeedbackDetailPage,
  SuperAdminFeedbackTopicsPage,
  SuperAdminOnboardingPage,
  ProblemsSuggestionsPage,
  SuperAdminInstitutionsPage,
  SuperAdminInstitutionDetailPage,
  InstitutionalOrderStorageListPage,
  InstitutionalOrderStorageDetailPage,
  InstitutionalPendingApprovalsPage,
  InstitutionOrdersPoolPage,
  SuperAdminEditWebsitePage,
  SuperAdminEditWebsiteFaqPage,
  SuperAdminSitePagesPage,
  SuperAdminSitePageEditPage,
  SuperAdminEditWebsiteFooterPage,
  SuperAdminEditWebsiteFooterContactPage,
  SuperAdminEditWebsiteFooterHoursPage,
  SuperAdminEditWebsiteFooterAppsPage,
  SuperAdminEditWebsiteFooterContactCenterPage,
  SuperAdminEditWebsiteHowItWorksPage,
  SuperAdminEditWebsiteHowItWorksEditorPage,
  HowItWorksFreelancerPage,
  HowItWorksClientPage,
  AdminOrdersPage,
  AdminCreateOrderPage,
  AdminSubscriptionsActivationPage,
  AdminCoursesPage,
  AdminAdsPage,
  AdminPantryPage,
  AdminSettingsPage,
  FreelancerPantryPage,
  FreelancerMarketplaceArticlesPage,
  FreelancerMarketplaceArticleDetailPage,
  TrainingOrdersAdminShell,
  TrainingOrdersOverviewPage,
  TrainingOrdersSettingsPage,
  TrainingOrderTemplatesPage,
  TrainingOrderApplicationsPage,
  ClientCreateOrderOpenAndRedirect,
  ClientMyOrdersPage,
  ClientFinancialPage,
  ClientProfilePage,
  ClientSettingsPage,
  FreelancerOrderDetailsPage,
  FreelancerEliteOfferPage,
  FreelancerMyOrderDetailsPage,
  FreelancerFinancialClaimsPage,
  FreelancerPlansPage,
  FreelancerCoursesPage,
  FreelancerCourseDetailsPage,
  FreelancerSettingsPage,
  FreelancerActivateAccountPage,
  FreelancerGettingStartedPage,
  ConvertAccountPage,
  NotificationsPage,
  FinancialUserMyBonusesPage,
} from "./routes/lazyPages";
import { ROLE } from "./constants/authRoutes";
import { useAuth } from "./context/useAuth";
import { clearAnalyticsUser, initAnalytics, runAnalyticsStartupChecks, setAnalyticsUser, trackPageView } from "./services/analytics";
import {
  clearGuestPoolLoginToastFlag,
  isGuestPoolLoginToast,
} from "./utils/guestPoolLoginToast";
const PopupAdsHost = lazy(() => import("./components/ads/PopupAdsHost"));

function AnalyticsBridge() {
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    runAnalyticsStartupChecks();
    let timeoutId = null;
    let idleId = null;
    const boot = () => initAnalytics();
    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(boot, { timeout: 2500 });
    } else {
      timeoutId = window.setTimeout(boot, 900);
    }
    return () => {
      if (idleId != null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
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
          <CurrencyDisplayProvider>
          <AnalyticsBridge />
          <ToastDashboardExitBridge />
          <ToastGuestPoolBridge />
          <Suspense fallback={null}>
            <PopupAdsHost />
          </Suspense>
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
              <Route path="/account-deletion" element={<AccountDeletion />} />
              <Route path="/guarantee" element={<PublicGuaranteePage />} />
              <Route path="/help-center" element={<PublicHelpCenterPage />} />
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
                  path="/dashboard/super-admin/analysis"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.analytics}>
                      <SuperAdminAnalysisPage />
                    </RequireStaffPage>
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
                  path="/dashboard/super-admin/marketplace-plans"
                  element={
                    <RequireRole allowedRoles={[ROLE.SUPER_ADMIN]}>
                      <SuperAdminMarketplacePlansPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/super-admin/training-packages"
                  element={
                    <RequireRole allowedRoles={[ROLE.SUPER_ADMIN]}>
                      <SuperAdminTrainingPackagesPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/super-admin/marketplace-economy"
                  element={
                    <RequireRole allowedRoles={[ROLE.SUPER_ADMIN]}>
                      <SuperAdminMarketplaceEconomyPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/super-admin/marketplace-articles"
                  element={
                    <RequireRole allowedRoles={[ROLE.SUPER_ADMIN]}>
                      <SuperAdminMarketplaceArticlesPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/super-admin/bildazo-author-links"
                  element={
                    <RequireRole allowedRoles={[ROLE.SUPER_ADMIN]}>
                      <SuperAdminBildazoAuthorLinksPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/super-admin/bid-credits"
                  element={
                    <RequireRole allowedRoles={[ROLE.SUPER_ADMIN]}>
                      <SuperAdminBidCreditsPage />
                    </RequireRole>
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
                  path="/dashboard/super-admin/financial-center/employees/:personId"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.financialCenter}>
                      <FinancialEmployeeDetailPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/financial-center"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.financialCenter}>
                      <SuperAdminFinancialCenterPage />
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
                  path="/dashboard/super-admin/rate-limit-exemptions"
                  element={
                    <RequireRole allowedRoles={[ROLE.SUPER_ADMIN]}>
                      <SuperAdminRateLimitExemptionsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/super-admin/onboarding"
                  element={
                    <RequireRole allowedRoles={[ROLE.SUPER_ADMIN]}>
                      <SuperAdminOnboardingPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/super-admin/feedback"
                  element={
                    <RequireRole allowedRoles={[ROLE.SUPER_ADMIN]}>
                      <SuperAdminFeedbackPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/super-admin/feedback/topics"
                  element={
                    <RequireRole allowedRoles={[ROLE.SUPER_ADMIN]}>
                      <SuperAdminFeedbackTopicsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/super-admin/feedback/:id"
                  element={
                    <RequireRole allowedRoles={[ROLE.SUPER_ADMIN]}>
                      <SuperAdminFeedbackDetailPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/super-admin/institutions"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.institutions}>
                      <SuperAdminInstitutionsPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/institutions/:institutionId"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.institutions}>
                      <SuperAdminInstitutionDetailPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/institutional-order-storage"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.institutionalOrderStorage}>
                      <InstitutionalOrderStorageListPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/institutional-order-storage/pending"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.institutionalOrderStorage}>
                      <InstitutionalPendingApprovalsPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/institutional-order-storage/:storageId"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.institutionalOrderStorage}>
                      <InstitutionalOrderStorageDetailPage />
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
                  path="/dashboard/super-admin/edit-website/footer"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.editWebsite}>
                      <SuperAdminEditWebsiteFooterPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/edit-website/footer/contact"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.editWebsite}>
                      <SuperAdminEditWebsiteFooterContactPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/edit-website/footer/working-hours"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.editWebsite}>
                      <SuperAdminEditWebsiteFooterHoursPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/edit-website/footer/app-downloads"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.editWebsite}>
                      <SuperAdminEditWebsiteFooterAppsPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/edit-website/footer/contact-center"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.editWebsite}>
                      <SuperAdminEditWebsiteFooterContactCenterPage />
                    </RequireStaffPage>
                  }
                />
                <Route
                  path="/dashboard/super-admin/edit-website/footer-app-downloads"
                  element={
                    <Navigate to="/dashboard/super-admin/edit-website/footer/app-downloads" replace />
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
                  <Route
                    path="rounds"
                    element={<Navigate to="/dashboard/super-admin/training-orders#round-history" replace />}
                  />
                  <Route path="applications" element={<TrainingOrderApplicationsPage />} />
                </Route>
                <Route
                  path="/dashboard/super-admin/pantry"
                  element={
                    <RequireStaffPage permission={SUPER_ADMIN_PAGE_PERMISSIONS.pantry}>
                      <AdminPantryPage />
                    </RequireStaffPage>
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
                  path="/dashboard/admin/notifications"
                  element={
                    <RequireRole allowedRoles={[ROLE.ADMIN]}>
                      <NotificationsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/admin/settings"
                  element={
                    <RequireRole allowedRoles={[ROLE.ADMIN]}>
                      <AdminSettingsPage />
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
                  path="/dashboard/admin/pantry"
                  element={
                    <RequireRole allowedRoles={[ROLE.ADMIN]}>
                      <RequirePermission permission={SUPER_ADMIN_PAGE_PERMISSIONS.pantry}>
                        <AdminPantryPage />
                      </RequirePermission>
                    </RequireRole>
                  }
                />

                <Route
                  path="/dashboard/freelancer/institution-orders"
                  element={
                    <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                      <InstitutionOrdersPoolPage />
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
                  path="/dashboard/freelancer/getting-started"
                  element={
                    <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                      <FreelancerGettingStartedPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/freelancer/activate-account"
                  element={
                    <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                      <FreelancerActivateAccountPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/freelancer/convert-account"
                  element={
                    <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                      <ConvertAccountPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/client/convert-account"
                  element={
                    <RequireRole allowedRoles={[ROLE.CLIENT]}>
                      <ConvertAccountPage />
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
                  path="/dashboard/freelancer/pantry"
                  element={
                    <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                      <FreelancerPantryPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/freelancer/elite-offers/:offerId"
                  element={
                    <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                      <FreelancerEliteOfferPage />
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
                  path="/dashboard/freelancer/feedback"
                  element={
                    <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                      <ProblemsSuggestionsPage />
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
                  path="/dashboard/freelancer/articles"
                  element={
                    <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                      <FreelancerMarketplaceArticlesPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dashboard/freelancer/articles/:id"
                  element={
                    <RequireRole allowedRoles={[ROLE.FREELANCER]}>
                      <FreelancerMarketplaceArticleDetailPage />
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
                  path="/dashboard/client/feedback"
                  element={
                    <RequireRole allowedRoles={[ROLE.CLIENT]}>
                      <ProblemsSuggestionsPage />
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
                <Route
                  path="/dashboard/my-bonuses"
                  element={
                    <RequireRole allowedRoles={[ROLE.FINANCIAL_USER]}>
                      <FinancialUserMyBonusesPage />
                    </RequireRole>
                  }
                />
                <Route path="/dashboard/financial-user" element={<Navigate to="/dashboard/my-bonuses" replace />} />
                <Route path="/dashboard/*" element={<NotFoundPage />} />
              </Route>
            </Route>
          </Routes>
          </CurrencyDisplayProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
