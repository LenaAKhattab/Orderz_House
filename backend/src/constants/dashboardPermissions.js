/** Page-based dashboard permission keys (admin + super_admin sidebars). */

/** Business pages super admin may assign to admin accounts. */
const ASSIGNABLE_ADMIN_PERMISSIONS = Object.freeze([
  "dashboard.admin.orders",
  "dashboard.admin.create_order",
  "dashboard.admin.courses",
  "dashboard.admin.ads",
  "dashboard.admin.subscription_activation",
]);

const ADMIN_DASHBOARD_PERMISSIONS = Object.freeze([
  ...ASSIGNABLE_ADMIN_PERMISSIONS,
  // Legacy/extra keys kept for DB compatibility — not assignable via admin management UI
  "dashboard.admin.overview",
  "dashboard.admin.notifications",
  "dashboard.admin.settings",
]);

const SUPER_ADMIN_DASHBOARD_PERMISSIONS = Object.freeze([
  "dashboard.super_admin.overview",
  "dashboard.super_admin.plans",
  "dashboard.super_admin.subscriptions",
  "dashboard.super_admin.financial_claims",
  "dashboard.super_admin.analytics",
  "dashboard.super_admin.admins_manage",
  "dashboard.super_admin.training_orders",
]);

const PERMISSION_GROUPS = Object.freeze([
  {
    id: "admin_dashboard",
    label: "لوحة الإدارة",
    permissions: [
      { key: "dashboard.admin.orders", label: "الطلبات الداخلية" },
      { key: "dashboard.admin.create_order", label: "إنشاء طلب داخلي" },
      { key: "dashboard.admin.courses", label: "الدورات" },
      { key: "dashboard.admin.ads", label: "الإعلانات" },
      { key: "dashboard.admin.subscription_activation", label: "تفعيل الاشتراكات" },
    ],
  },
]);

module.exports = {
  ADMIN_DASHBOARD_PERMISSIONS,
  SUPER_ADMIN_DASHBOARD_PERMISSIONS,
  ASSIGNABLE_ADMIN_PERMISSIONS,
  PERMISSION_GROUPS,
};
