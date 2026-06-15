import { ADMIN_PAGE_PERMISSIONS } from "./dashboardPermissions";
import { formatBreadcrumbTrail } from "../lib/i18n/resolveNavLabel";

/** Always visible — admin home shell (no page permission). */
export const ADMIN_NAV_HOME = {
  to: "/dashboard/admin",
  labelKey: "dashboard.nav.admin.home",
  icon: "⌂",
  end: true,
  permission: null,
};

/** Always visible — personal notifications (no page permission). */
export const ADMIN_NAV_NOTIFICATIONS = {
  to: "/dashboard/admin/notifications",
  labelKey: "dashboard.nav.common.notifications",
  icon: "✉",
  permission: null,
};

/** Permission-gated business pages only. */
export const ADMIN_NAV_MAIN = [
  {
    to: "/dashboard/admin/orders",
    labelKey: "dashboard.nav.admin.internalRequests",
    icon: "▣",
    matchPrefix: "/dashboard/admin/orders",
    permission: ADMIN_PAGE_PERMISSIONS.orders,
  },
  {
    to: "/dashboard/admin/courses",
    labelKey: "dashboard.nav.admin.courses",
    icon: "▶",
    matchPrefix: "/dashboard/admin/courses",
    permission: ADMIN_PAGE_PERMISSIONS.courses,
  },
  {
    to: "/dashboard/admin/ads",
    labelKey: "dashboard.nav.admin.ads",
    icon: "✴",
    end: true,
    matchPrefix: "/dashboard/admin/ads",
    permission: ADMIN_PAGE_PERMISSIONS.ads,
  },
  {
    to: "/dashboard/admin/subscriptions",
    labelKey: "dashboard.nav.admin.subscriptions",
    icon: "✓",
    permission: ADMIN_PAGE_PERMISSIONS.subscriptionActivation,
  },
];

export const ADMIN_NAV_CREATE_ORDER = {
  to: "/dashboard/admin/orders/create",
  labelKey: "dashboard.nav.admin.createInternalRequest",
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

export function adminPageTitle(pathname, t) {
  if (pathname.includes("/orders/create")) return t("dashboard.breadcrumbs.createInternalRequest");
  if (pathname.includes("/orders")) return t("dashboard.breadcrumbs.internalRequests");
  if (pathname.includes("/courses")) return t("dashboard.breadcrumbs.courses");
  if (pathname.includes("/ads")) return t("dashboard.breadcrumbs.ads");
  if (pathname.includes("/subscriptions")) return t("dashboard.breadcrumbs.subscriptionActivation");
  if (pathname.includes("/notifications")) return t("dashboard.breadcrumbs.notifications");
  if (pathname === "/dashboard/admin") return t("dashboard.nav.admin.panelTitle");
  return t("dashboard.nav.admin.panelTitle");
}

export function adminBreadcrumbKeys(pathname) {
  const base = ["dashboard.breadcrumbs.adminHome"];
  if (pathname.includes("/orders/create")) {
    return [...base, "dashboard.breadcrumbs.internalRequests", "dashboard.breadcrumbs.createInternalRequest"];
  }
  if (pathname.includes("/orders")) return [...base, "dashboard.breadcrumbs.internalRequests"];
  if (pathname.includes("/courses")) return [...base, "dashboard.breadcrumbs.courses"];
  if (pathname.includes("/ads")) return [...base, "dashboard.breadcrumbs.ads"];
  if (pathname.includes("/subscriptions")) return [...base, "dashboard.breadcrumbs.subscriptionActivation"];
  if (pathname.includes("/notifications")) return [...base, "dashboard.breadcrumbs.notifications"];
  return base;
}

/** @deprecated Use adminBreadcrumbKeys(pathname) with formatBreadcrumbTrail(keys, t) */
export function adminBreadcrumb(pathname, t) {
  return formatBreadcrumbTrail(adminBreadcrumbKeys(pathname), t);
}
