import { ROLE } from "./authRoutes";

/** Admin dashboard page permissions (shared with super-admin routes for the same pages). */
export const ADMIN_PAGE_PERMISSIONS = {
  orders: "dashboard.admin.orders",
  createOrder: "dashboard.admin.create_order",
  courses: "dashboard.admin.courses",
  ads: "dashboard.admin.ads",
  subscriptionActivation: "dashboard.admin.subscription_activation",
};

/** Super-admin dashboard page permissions (assignable to admin accounts). */
export const SUPER_ADMIN_PAGE_PERMISSIONS = {
  overview: "dashboard.super_admin.overview",
  plans: "dashboard.super_admin.plans",
  subscriptions: "dashboard.super_admin.subscriptions",
  financialClaims: "dashboard.super_admin.financial_claims",
  analytics: "dashboard.super_admin.analytics",
  adminsManage: "dashboard.super_admin.admins_manage",
  trainingOrders: "dashboard.super_admin.training_orders",
  editWebsite: "dashboard.super_admin.edit_website",
};

/** All assignable dashboard page permission keys (mirrors backend ASSIGNABLE_ADMIN_PERMISSIONS). */
export const ASSIGNABLE_DASHBOARD_PERMISSIONS = [
  SUPER_ADMIN_PAGE_PERMISSIONS.overview,
  SUPER_ADMIN_PAGE_PERMISSIONS.plans,
  ADMIN_PAGE_PERMISSIONS.courses,
  ADMIN_PAGE_PERMISSIONS.ads,
  SUPER_ADMIN_PAGE_PERMISSIONS.subscriptions,
  ADMIN_PAGE_PERMISSIONS.subscriptionActivation,
  SUPER_ADMIN_PAGE_PERMISSIONS.financialClaims,
  ADMIN_PAGE_PERMISSIONS.orders,
  ADMIN_PAGE_PERMISSIONS.createOrder,
  SUPER_ADMIN_PAGE_PERMISSIONS.trainingOrders,
  SUPER_ADMIN_PAGE_PERMISSIONS.adminsManage,
  SUPER_ADMIN_PAGE_PERMISSIONS.editWebsite,
];

/** Longest-prefix-first route → permission (super-admin shell paths). */
const SUPER_ADMIN_ROUTE_RULES = [
  { prefix: "/dashboard/super-admin/analysis", permission: SUPER_ADMIN_PAGE_PERMISSIONS.analytics },
  { prefix: "/dashboard/super-admin/edit-website", permission: SUPER_ADMIN_PAGE_PERMISSIONS.editWebsite },
  { prefix: "/dashboard/super-admin/training-orders", permission: SUPER_ADMIN_PAGE_PERMISSIONS.trainingOrders },
  { prefix: "/dashboard/super-admin/subscriptions/activation", permission: ADMIN_PAGE_PERMISSIONS.subscriptionActivation },
  { prefix: "/dashboard/super-admin/subscriptions", permission: SUPER_ADMIN_PAGE_PERMISSIONS.subscriptions },
  { prefix: "/dashboard/super-admin/financial-claims", permission: SUPER_ADMIN_PAGE_PERMISSIONS.financialClaims },
  { prefix: "/dashboard/super-admin/admins", permission: SUPER_ADMIN_PAGE_PERMISSIONS.adminsManage },
  { prefix: "/dashboard/super-admin/plans", permission: SUPER_ADMIN_PAGE_PERMISSIONS.plans },
  { prefix: "/dashboard/super-admin/courses", permission: ADMIN_PAGE_PERMISSIONS.courses },
  { prefix: "/dashboard/super-admin/ads", permission: ADMIN_PAGE_PERMISSIONS.ads },
  { prefix: "/dashboard/super-admin/orders/create", permission: ADMIN_PAGE_PERMISSIONS.createOrder },
  { prefix: "/dashboard/super-admin/orders", permission: ADMIN_PAGE_PERMISSIONS.orders },
  { exact: "/dashboard/super-admin", permission: SUPER_ADMIN_PAGE_PERMISSIONS.overview },
];

/** Login redirect order — mirrors adminNav + superAdminNav without importing them (avoids circular deps). */
const ADMIN_SHELL_NAV_ORDER = [
  { to: "/dashboard/admin/orders", permission: ADMIN_PAGE_PERMISSIONS.orders },
  { to: "/dashboard/admin/courses", permission: ADMIN_PAGE_PERMISSIONS.courses },
  { to: "/dashboard/admin/ads", permission: ADMIN_PAGE_PERMISSIONS.ads },
  { to: "/dashboard/admin/subscriptions", permission: ADMIN_PAGE_PERMISSIONS.subscriptionActivation },
  { to: "/dashboard/admin/orders/create", permission: ADMIN_PAGE_PERMISSIONS.createOrder },
];

const SUPER_ADMIN_SHELL_NAV_ORDER = [
  { to: "/dashboard/super-admin", permission: SUPER_ADMIN_PAGE_PERMISSIONS.overview },
  { to: "/dashboard/super-admin/analysis", permission: SUPER_ADMIN_PAGE_PERMISSIONS.analytics },
  { to: "/dashboard/super-admin/plans", permission: SUPER_ADMIN_PAGE_PERMISSIONS.plans },
  { to: "/dashboard/super-admin/courses", permission: ADMIN_PAGE_PERMISSIONS.courses },
  { to: "/dashboard/super-admin/ads", permission: ADMIN_PAGE_PERMISSIONS.ads },
  { to: "/dashboard/super-admin/subscriptions", permission: SUPER_ADMIN_PAGE_PERMISSIONS.subscriptions },
  { to: "/dashboard/super-admin/subscriptions/activation", permission: ADMIN_PAGE_PERMISSIONS.subscriptionActivation },
  { to: "/dashboard/super-admin/financial-claims", permission: SUPER_ADMIN_PAGE_PERMISSIONS.financialClaims },
  { to: "/dashboard/super-admin/orders", permission: ADMIN_PAGE_PERMISSIONS.orders },
  { to: "/dashboard/super-admin/training-orders", permission: SUPER_ADMIN_PAGE_PERMISSIONS.trainingOrders },
  { to: "/dashboard/super-admin/admins", permission: SUPER_ADMIN_PAGE_PERMISSIONS.adminsManage },
  { to: "/dashboard/super-admin/edit-website", permission: SUPER_ADMIN_PAGE_PERMISSIONS.editWebsite },
];

/** Route path → required permission for admin business pages (home + notifications are role-only). */
export const ADMIN_ROUTE_PERMISSIONS = {
  "/dashboard/admin/orders": ADMIN_PAGE_PERMISSIONS.orders,
  "/dashboard/admin/orders/create": ADMIN_PAGE_PERMISSIONS.createOrder,
  "/dashboard/admin/courses": ADMIN_PAGE_PERMISSIONS.courses,
  "/dashboard/admin/ads": ADMIN_PAGE_PERMISSIONS.ads,
  "/dashboard/admin/subscriptions": ADMIN_PAGE_PERMISSIONS.subscriptionActivation,
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

export function getSuperAdminRoutePermission(pathname) {
  const p = String(pathname || "");
  for (const rule of SUPER_ADMIN_ROUTE_RULES) {
    if (rule.exact && p === rule.exact) return rule.permission;
    if (rule.prefix && p.startsWith(rule.prefix)) return rule.permission;
  }
  return null;
}

export function isDelegatedSuperAdminDashboardPath(pathname) {
  return getSuperAdminRoutePermission(pathname) != null;
}

export function getAdminRoutePermission(pathname) {
  const p = String(pathname || "");
  if (ADMIN_ROUTE_PERMISSIONS[p]) return ADMIN_ROUTE_PERMISSIONS[p];
  if (p.startsWith("/dashboard/admin/orders/")) return ADMIN_PAGE_PERMISSIONS.orders;
  if (p.startsWith("/dashboard/admin/courses/")) return ADMIN_PAGE_PERMISSIONS.courses;
  if (p.startsWith("/dashboard/admin/ads/")) return ADMIN_PAGE_PERMISSIONS.ads;
  return null;
}

export function getDashboardRoutePermission(pathname) {
  const superPerm = getSuperAdminRoutePermission(pathname);
  if (superPerm) return superPerm;
  return getAdminRoutePermission(pathname);
}

/** First permitted dashboard destination for admin accounts after login/redirect. */
export function getFirstAccessibleDashboardPath(user) {
  if (isSuperAdminUser(user)) return "/dashboard/super-admin";

  const role = user?.primaryRole || user?.role;
  if (role !== ROLE.ADMIN) {
    return role === ROLE.FREELANCER
      ? "/dashboard/freelancer"
      : role === ROLE.CLIENT
        ? "/dashboard/client"
        : "/dashboard";
  }

  for (const item of ADMIN_SHELL_NAV_ORDER) {
    if (userHasPermission(user, item.permission)) return item.to;
  }
  for (const item of SUPER_ADMIN_SHELL_NAV_ORDER) {
    if (userHasPermission(user, item.permission)) return item.to;
  }
  return "/dashboard/admin";
}

export function adminUsesSuperAdminShell(pathname) {
  return String(pathname || "").startsWith("/dashboard/super-admin")
    && isDelegatedSuperAdminDashboardPath(pathname);
}
