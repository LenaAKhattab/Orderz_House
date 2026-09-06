/** Page-based dashboard permission keys (admin + super_admin sidebars). */

/**
 * Assignable dashboard page permissions — mirrors real sidebar/nav pages.
 * Single source of truth for admin-management UI and backend validation.
 *
 * Intentionally excluded:
 * - dashboard.super_admin.analytics — no live sidebar route/page
 * - dashboard.admin.overview / notifications / settings — always available to admin role
 */
const DASHBOARD_PERMISSION_OPTIONS = Object.freeze([
  { key: "dashboard.super_admin.overview", labelKey: "dashboard.nav.superAdmin.overview" },
  { key: "dashboard.super_admin.plans", labelKey: "dashboard.nav.superAdmin.plans" },
  { key: "dashboard.admin.courses", labelKey: "dashboard.nav.superAdmin.courses" },
  { key: "dashboard.admin.ads", labelKey: "dashboard.nav.superAdmin.ads" },
  { key: "dashboard.super_admin.subscriptions", labelKey: "dashboard.nav.superAdmin.subscriptions" },
  { key: "dashboard.admin.subscription_activation", labelKey: "dashboard.nav.superAdmin.subscriptionActivation" },
  { key: "dashboard.super_admin.financial_claims", labelKey: "dashboard.nav.superAdmin.financialClaims" },
  { key: "dashboard.super_admin.financial_center", labelKey: "dashboard.nav.superAdmin.financialCenter" },
  { key: "dashboard.admin.orders", labelKey: "dashboard.nav.superAdmin.internalRequests" },
  { key: "dashboard.admin.create_order", labelKey: "dashboard.nav.superAdmin.createRequest" },
  { key: "dashboard.super_admin.training_orders", labelKey: "dashboard.nav.superAdmin.trainingRequests" },
  { key: "dashboard.super_admin.pantry", labelKey: "dashboard.nav.superAdmin.pantry" },
  { key: "dashboard.super_admin.institutions", labelKey: "dashboard.nav.superAdmin.institutionsManagement" },
  { key: "dashboard.super_admin.institutional_order_storage", labelKey: "dashboard.nav.superAdmin.institutionalOrderStorage" },
  { key: "dashboard.super_admin.admins_manage", labelKey: "dashboard.nav.superAdmin.admins" },
  { key: "dashboard.super_admin.edit_website", labelKey: "dashboard.nav.superAdmin.editWebsite" },
]);

/** Business pages super admin may assign to admin accounts. */
const ASSIGNABLE_ADMIN_PERMISSIONS = Object.freeze(
  DASHBOARD_PERMISSION_OPTIONS.map((option) => option.key),
);

const ADMIN_DASHBOARD_PERMISSIONS = Object.freeze([
  ...ASSIGNABLE_ADMIN_PERMISSIONS.filter((key) => key.startsWith("dashboard.admin.")),
  // Legacy/extra keys kept for DB compatibility — not assignable via admin management UI
  "dashboard.admin.overview",
  "dashboard.admin.notifications",
  "dashboard.admin.settings",
]);

const SUPER_ADMIN_DASHBOARD_PERMISSIONS = Object.freeze([
  ...ASSIGNABLE_ADMIN_PERMISSIONS.filter((key) => key.startsWith("dashboard.super_admin.")),
  // Legacy key — no sidebar page; kept for DB compatibility only
  "dashboard.super_admin.analytics",
]);

const PERMISSION_GROUPS = Object.freeze([
  {
    id: "platform_dashboard",
    labelKey: "dashboard.permissions.groups.platform",
    permissions: DASHBOARD_PERMISSION_OPTIONS.map(({ key, labelKey }) => ({ key, labelKey })),
  },
]);

/** Stable permission key constants for route guards. */
const PERMISSION_KEYS = Object.freeze({
  OVERVIEW: "dashboard.super_admin.overview",
  PLANS: "dashboard.super_admin.plans",
  COURSES: "dashboard.admin.courses",
  ADS: "dashboard.admin.ads",
  SUBSCRIPTIONS: "dashboard.super_admin.subscriptions",
  SUBSCRIPTION_ACTIVATION: "dashboard.admin.subscription_activation",
  FINANCIAL_CLAIMS: "dashboard.super_admin.financial_claims",
  FINANCIAL_CENTER: "dashboard.super_admin.financial_center",
  ORDERS: "dashboard.admin.orders",
  CREATE_ORDER: "dashboard.admin.create_order",
  TRAINING_ORDERS: "dashboard.super_admin.training_orders",
  PANTRY: "dashboard.super_admin.pantry",
  ADMINS_MANAGE: "dashboard.super_admin.admins_manage",
  EDIT_WEBSITE: "dashboard.super_admin.edit_website",
  ANALYTICS: "dashboard.super_admin.analytics",
  INSTITUTIONS: "dashboard.super_admin.institutions",
  INSTITUTIONAL_ORDER_STORAGE: "dashboard.super_admin.institutional_order_storage",
  INSTITUTIONAL_STORAGE_VIEW: "institutional_order_storage.view",
  INSTITUTIONAL_STORAGE_APPROVE: "institutional_order_storage.approve",
  INSTITUTIONAL_STORAGE_TRANSFER: "institutional_order_storage.transfer_to_training",
  INSTITUTIONAL_STORAGE_RETRY_RELEASE: "institutional_order_storage.retry_release",
});

module.exports = {
  ADMIN_DASHBOARD_PERMISSIONS,
  SUPER_ADMIN_DASHBOARD_PERMISSIONS,
  ASSIGNABLE_ADMIN_PERMISSIONS,
  DASHBOARD_PERMISSION_OPTIONS,
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
};
