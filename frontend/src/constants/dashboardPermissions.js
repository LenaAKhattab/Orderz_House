import { ROLE } from "./authRoutes";

/** Admin dashboard page permissions (assignable to admin role). */
/** Permission-gated admin business pages only. */
export const ADMIN_PAGE_PERMISSIONS = {
  orders: "dashboard.admin.orders",
  createOrder: "dashboard.admin.create_order",
  courses: "dashboard.admin.courses",
  ads: "dashboard.admin.ads",
  subscriptionActivation: "dashboard.admin.subscription_activation",
};

/** Super-admin-only dashboard pages. */
export const SUPER_ADMIN_PAGE_PERMISSIONS = {
  overview: "dashboard.super_admin.overview",
  plans: "dashboard.super_admin.plans",
  subscriptions: "dashboard.super_admin.subscriptions",
  financialClaims: "dashboard.super_admin.financial_claims",
  analytics: "dashboard.super_admin.analytics",
  adminsManage: "dashboard.super_admin.admins_manage",
  trainingOrders: "dashboard.super_admin.training_orders",
};

export function isSuperAdminUser(user) {
  const role = user?.primaryRole || user?.role;
  if (role === ROLE.SUPER_ADMIN) return true;
  return Array.isArray(user?.roles) && user.roles.includes(ROLE.SUPER_ADMIN);
}

export function userHasPermission(user, permissionKey) {
  if (!user || !permissionKey) return false;
  if (isSuperAdminUser(user)) return true;
  const perms = Array.isArray(user?.permissions) ? user.permissions : [];
  return perms.includes(permissionKey);
}

export function userHasAnyPermission(user, permissionKeys) {
  if (!user) return false;
  if (isSuperAdminUser(user)) return true;
  const keys = Array.isArray(permissionKeys) ? permissionKeys : [];
  return keys.some((k) => userHasPermission(user, k));
}

/** Route path → required permission for admin business pages (home + notifications are role-only). */
export const ADMIN_ROUTE_PERMISSIONS = {
  "/dashboard/admin/orders": ADMIN_PAGE_PERMISSIONS.orders,
  "/dashboard/admin/orders/create": ADMIN_PAGE_PERMISSIONS.createOrder,
  "/dashboard/admin/courses": ADMIN_PAGE_PERMISSIONS.courses,
  "/dashboard/admin/ads": ADMIN_PAGE_PERMISSIONS.ads,
  "/dashboard/admin/subscriptions": ADMIN_PAGE_PERMISSIONS.subscriptionActivation,
};

export function getAdminRoutePermission(pathname) {
  const p = String(pathname || "");
  if (ADMIN_ROUTE_PERMISSIONS[p]) return ADMIN_ROUTE_PERMISSIONS[p];
  if (p.startsWith("/dashboard/admin/orders/")) return ADMIN_PAGE_PERMISSIONS.orders;
  if (p.startsWith("/dashboard/admin/courses/")) return ADMIN_PAGE_PERMISSIONS.courses;
  if (p.startsWith("/dashboard/admin/ads/")) return ADMIN_PAGE_PERMISSIONS.ads;
  return null;
}
