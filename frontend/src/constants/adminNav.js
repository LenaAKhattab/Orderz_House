import { ADMIN_PAGE_PERMISSIONS } from "./dashboardPermissions";

/** Always visible — admin home shell (no page permission). */
export const ADMIN_NAV_HOME = {
  to: "/dashboard/admin",
  label: "لوحة التحكم",
  icon: "⌂",
  end: true,
  permission: null,
};

/** Always visible — personal notifications (no page permission). */
export const ADMIN_NAV_NOTIFICATIONS = {
  to: "/dashboard/admin/notifications",
  label: "الإشعارات",
  icon: "✉",
  permission: null,
};

/** Permission-gated business pages only. */
export const ADMIN_NAV_MAIN = [
  {
    to: "/dashboard/admin/orders",
    label: "الطلبات الداخلية",
    icon: "▣",
    matchPrefix: "/dashboard/admin/orders",
    permission: ADMIN_PAGE_PERMISSIONS.orders,
  },
  {
    to: "/dashboard/admin/courses",
    label: "الدورات",
    icon: "▶",
    matchPrefix: "/dashboard/admin/courses",
    permission: ADMIN_PAGE_PERMISSIONS.courses,
  },
  {
    to: "/dashboard/admin/ads",
    label: "الإعلانات",
    icon: "✴",
    end: true,
    matchPrefix: "/dashboard/admin/ads",
    permission: ADMIN_PAGE_PERMISSIONS.ads,
  },
  {
    to: "/dashboard/admin/subscriptions",
    label: "تفعيل الاشتراكات",
    icon: "✓",
    permission: ADMIN_PAGE_PERMISSIONS.subscriptionActivation,
  },
];

export const ADMIN_NAV_CREATE_ORDER = {
  to: "/dashboard/admin/orders/create",
  label: "إنشاء طلب داخلي",
  icon: "+",
  permission: ADMIN_PAGE_PERMISSIONS.createOrder,
};

export function filterAdminNavItems(items, user, hasPermission) {
  return items.filter((item) => !item.permission || hasPermission(user, item.permission));
}

export function isAdminDashboardPath(pathname) {
  const p = String(pathname || "");
  return p === "/dashboard/admin" || p.startsWith("/dashboard/admin/");
}

export function adminPageTitle(pathname) {
  if (pathname.includes("/orders/create")) return "إنشاء طلب داخلي";
  if (pathname.includes("/orders")) return "الطلبات الداخلية";
  if (pathname.includes("/courses")) return "الدورات";
  if (pathname.includes("/ads")) return "الإعلانات";
  if (pathname.includes("/subscriptions")) return "تفعيل الاشتراكات";
  if (pathname.includes("/notifications")) return "الإشعارات";
  if (pathname === "/dashboard/admin") return "لوحة الإدارة";
  return "لوحة الإدارة";
}

export function adminBreadcrumb(pathname) {
  const base = ["لوحة الإدارة"];
  if (pathname.includes("/orders/create")) return [...base, "الطلبات الداخلية", "إنشاء طلب"].join(" › ");
  if (pathname.includes("/orders")) return [...base, "الطلبات الداخلية"].join(" › ");
  if (pathname.includes("/courses")) return [...base, "الدورات"].join(" › ");
  if (pathname.includes("/ads")) return [...base, "الإعلانات"].join(" › ");
  if (pathname.includes("/subscriptions")) return [...base, "تفعيل الاشتراكات"].join(" › ");
  if (pathname.includes("/notifications")) return [...base, "الإشعارات"].join(" › ");
  return base.join(" › ");
}
