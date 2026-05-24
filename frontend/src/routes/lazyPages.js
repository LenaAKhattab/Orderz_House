import { lazy } from "react";

/** Public marketing & auth — Home is eagerly loaded in App.jsx for first paint */
export const About = lazy(() => import("../pages/About"));
export const Services = lazy(() => import("../pages/Services"));
export const Plans = lazy(() => import("../pages/Plans"));
export const Orders = lazy(() => import("../pages/Orders"));
export const Login = lazy(() => import("../pages/Login"));
export const Register = lazy(() => import("../pages/Register"));
export const ForgotPassword = lazy(() => import("../pages/ForgotPassword"));
export const PrivacyPolicy = lazy(() => import("../pages/PrivacyPolicy"));
export const TermsConditions = lazy(() => import("../pages/TermsConditions"));
export const Unauthorized = lazy(() => import("../pages/Unauthorized"));
export const NotFoundPage = lazy(() => import("../pages/NotFoundPage"));

/** Shared dashboard hub */
export const DashboardPage = lazy(() => import("../pages/dashboard/DashboardPage"));

/** Super admin */
export const SuperAdminPlansPage = lazy(() => import("../pages/dashboard/SuperAdminPlansPage"));
export const SuperAdminSubscriptionsPage = lazy(() => import("../pages/dashboard/SuperAdminSubscriptionsPage"));
export const SuperAdminFinancialClaimsPage = lazy(
  () => import("../pages/dashboard/SuperAdminFinancialClaimsPage"),
);
export const SuperAdminSettingsPage = lazy(() => import("../pages/dashboard/SuperAdminSettingsPage"));

/** Admin */
export const AdminOrdersPage = lazy(() => import("../pages/dashboard/AdminOrdersPage"));
export const AdminCreateOrderPage = lazy(() => import("../pages/dashboard/AdminCreateOrderPage"));
export const AdminSubscriptionsActivationPage = lazy(
  () => import("../pages/dashboard/AdminSubscriptionsActivationPage"),
);
export const AdminCoursesPage = lazy(() => import("../pages/dashboard/AdminCoursesPage"));
export const AdminAdsPage = lazy(() => import("../pages/dashboard/AdminAdsPage"));
export const AdminSettingsPage = lazy(() => import("../pages/dashboard/AdminSettingsPage"));

/** Training orders (super admin) */
export const TrainingOrdersAdminShell = lazy(
  () => import("../pages/dashboard/trainingOrders/TrainingOrdersAdminShell"),
);
export const TrainingOrdersIndexRedirect = lazy(
  () => import("../pages/dashboard/trainingOrders/TrainingOrdersAdminShell").then((m) => ({
    default: m.TrainingOrdersIndexRedirect,
  })),
);
export const TrainingOrdersSettingsPage = lazy(
  () => import("../pages/dashboard/trainingOrders/TrainingOrdersSettingsPage"),
);
export const TrainingOrderTemplatesPage = lazy(
  () => import("../pages/dashboard/trainingOrders/TrainingOrderTemplatesPage"),
);
export const TrainingOrderRoundsPage = lazy(
  () => import("../pages/dashboard/trainingOrders/TrainingOrderRoundsPage"),
);
export const TrainingOrderApplicationsPage = lazy(
  () => import("../pages/dashboard/trainingOrders/TrainingOrderApplicationsPage"),
);

/** Client */
export const ClientCreateOrderOpenAndRedirect = lazy(
  () => import("../pages/dashboard/ClientCreateOrderOpenAndRedirect"),
);
export const ClientMyOrdersPage = lazy(() => import("../pages/dashboard/ClientMyOrdersPage"));
export const ClientFinancialPage = lazy(() => import("../pages/dashboard/ClientFinancialPage"));
export const ClientProfilePage = lazy(() => import("../pages/dashboard/ClientProfilePage"));
export const ClientSettingsPage = lazy(() => import("../pages/dashboard/ClientSettingsPage"));

/** Freelancer */
export const FreelancerOrderDetailsPage = lazy(() => import("../pages/dashboard/FreelancerOrderDetailsPage"));
export const FreelancerMyOrderDetailsPage = lazy(
  () => import("../pages/dashboard/FreelancerMyOrderDetailsPage"),
);
export const FreelancerFinancialClaimsPage = lazy(
  () => import("../pages/dashboard/FreelancerFinancialClaimsPage"),
);
export const FreelancerCoursesPage = lazy(() => import("../pages/dashboard/FreelancerCoursesPage"));
export const FreelancerCourseDetailsPage = lazy(() => import("../pages/dashboard/FreelancerCourseDetailsPage"));
export const FreelancerSettingsPage = lazy(() => import("../pages/dashboard/FreelancerSettingsPage"));

/** Shared dashboard utilities */
export const NotificationsPage = lazy(() => import("../pages/dashboard/NotificationsPage"));
