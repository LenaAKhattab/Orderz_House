/** Backend role strings (must match API JWT `role`). */
export const ROLE = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  FREELANCER: "freelancer",
  CLIENT: "client",
};

/** يُطلق بعد إنشاء طلب داخلي من النافذة لتحديث صفحة «الطلبات الداخلية» حتى لو بقي نفس المسار في React Router. */
export const INTERNAL_ORDERS_LIST_REFRESH = "orderz:internal-orders-refresh";

/** One dashboard URL per role — used for redirects and navbar. */
export const DASHBOARD_PATH = {
  [ROLE.SUPER_ADMIN]: "/dashboard/super-admin",
  [ROLE.ADMIN]: "/dashboard/admin",
  [ROLE.FREELANCER]: "/dashboard/freelancer",
  [ROLE.CLIENT]: "/dashboard/client",
};

export const DASHBOARD_TITLE = {
  [DASHBOARD_PATH[ROLE.SUPER_ADMIN]]: "لوحة المدير الأعلى",
  [DASHBOARD_PATH[ROLE.ADMIN]]: "لوحة الإدارة",
  [DASHBOARD_PATH[ROLE.FREELANCER]]: "لوحة المستقل",
  [DASHBOARD_PATH[ROLE.CLIENT]]: "لوحة العميل",
  "/dashboard/client/my-orders": "طلباتي",
  "/dashboard/client/my_orders": "طلباتي",
  "/dashboard/client/financial": "المالية",
  "/dashboard/super-admin/plans": "إدارة الباقات",
  "/dashboard/super-admin/subscriptions": "اشتراكات المستقلين",
  "/dashboard/super-admin/subscriptions/activation": "تفعيل الاشتراكات",
  "/dashboard/super-admin/financial-claims": "المطالبات المالية",
  "/dashboard/admin/subscriptions": "تفعيل الاشتراكات",
  "/dashboard/admin/courses": "إدارة الدورات",
  "/dashboard/admin/fake-orders": "إدارة الطلبات التجريبية",
  "/dashboard/freelancer/my-orders": "طلباتي",
  "/dashboard/freelancer/orders": "الطلبات",
  "/dashboard/freelancer/financial-claims": "المطالبات المالية",
  "/dashboard/freelancer/courses": "الدورات التدريبية",
  "/dashboard/super-admin/notifications": "الإشعارات",
  "/dashboard/super-admin/fake-orders": "إدارة الطلبات التجريبية",
  "/dashboard/super-admin/courses": "إدارة الدورات",
  "/dashboard/admin/notifications": "الإشعارات",
  "/dashboard/client/notifications": "الإشعارات",
  "/dashboard/freelancer/notifications": "الإشعارات",
};

/**
 * @param {string} role
 * @returns {string}
 */
export function getDashboardPath(role) {
  const path = DASHBOARD_PATH[role];
  return path || "/unauthorized";
}

/** Alias — same as getDashboardPath; use for redirects from "/" and logo targets. */
export function getDashboardPathByRole(role) {
  return getDashboardPath(role);
}

export function getNotificationsPath(role) {
  if (role === ROLE.SUPER_ADMIN) return "/dashboard/super-admin/notifications";
  if (role === ROLE.ADMIN) return "/dashboard/admin/notifications";
  if (role === ROLE.CLIENT) return "/dashboard/client/notifications";
  if (role === ROLE.FREELANCER) return "/dashboard/freelancer/notifications";
  return "/dashboard";
}

/**
 * @param {string} pathname
 */
export function isDashboardPath(pathname) {
  return pathname.startsWith("/dashboard");
}

/** Which role may open which dashboard URL (exact path). */
const DASHBOARD_PATH_TO_ROLES = {
  [DASHBOARD_PATH[ROLE.SUPER_ADMIN]]: [ROLE.SUPER_ADMIN],
  "/dashboard/super-admin/plans": [ROLE.SUPER_ADMIN],
  "/dashboard/super-admin/subscriptions": [ROLE.SUPER_ADMIN],
  "/dashboard/super-admin/subscriptions/activation": [ROLE.SUPER_ADMIN],
  "/dashboard/super-admin/financial-claims": [ROLE.SUPER_ADMIN],
  [DASHBOARD_PATH[ROLE.ADMIN]]: [ROLE.ADMIN],
  "/dashboard/admin/subscriptions": [ROLE.ADMIN],
  "/dashboard/admin/courses": [ROLE.ADMIN],
  "/dashboard/admin/fake-orders": [ROLE.ADMIN],
  "/dashboard/admin/notifications": [ROLE.ADMIN],
  [DASHBOARD_PATH[ROLE.FREELANCER]]: [ROLE.FREELANCER],
  [DASHBOARD_PATH[ROLE.CLIENT]]: [ROLE.CLIENT],
  "/dashboard/client/my-orders": [ROLE.CLIENT],
  "/dashboard/client/my_orders": [ROLE.CLIENT],
  "/dashboard/client/financial": [ROLE.CLIENT],
  "/dashboard/client/orders/create": [ROLE.CLIENT],
  "/dashboard/client/notifications": [ROLE.CLIENT],
  "/dashboard/freelancer/my-orders": [ROLE.FREELANCER],
  "/dashboard/freelancer/orders": [ROLE.FREELANCER],
  "/dashboard/freelancer/financial-claims": [ROLE.FREELANCER],
  "/dashboard/freelancer/courses": [ROLE.FREELANCER],
  "/dashboard/freelancer/notifications": [ROLE.FREELANCER],
  "/dashboard/super-admin/notifications": [ROLE.SUPER_ADMIN],
  "/dashboard/super-admin/fake-orders": [ROLE.SUPER_ADMIN],
  "/dashboard/super-admin/courses": [ROLE.SUPER_ADMIN],
};

/**
 * @param {string} pathname
 * @param {string} role
 */
export function canRoleAccessPath(pathname, role) {
  if (!pathname.startsWith("/dashboard")) {
    return true;
  }
  const allowed = DASHBOARD_PATH_TO_ROLES[pathname];
  if (!allowed) {
    return false;
  }
  return allowed.includes(role);
}

