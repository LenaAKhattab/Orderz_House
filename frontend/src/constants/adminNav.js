import { ADMIN_PAGE_PERMISSIONS, SUPER_ADMIN_PAGE_PERMISSIONS } from "./dashboardPermissions";
import { SUPER_ADMIN_NAV_MAIN } from "./superAdminNav";
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

/** Permission keys already represented in the admin shell (/dashboard/admin/*). */
export const ADMIN_SHELL_PERMISSION_KEYS = new Set(
  [
    ...ADMIN_NAV_MAIN.map((item) => item.permission),
    ADMIN_NAV_CREATE_ORDER.permission,
  ].filter(Boolean),
);

export function filterAdminNavItems(items, user, hasPermission) {
  return items.filter((item) => !item.permission || hasPermission(user, item.permission));
}

/** Primary super-admin route per permission for delegated admin sidebar (avoids duplicate nav). */
const DELEGATED_SUPER_ADMIN_NAV_PRIMARY_TO = {
  [SUPER_ADMIN_PAGE_PERMISSIONS.plans]: "/dashboard/super-admin/plans",
};

function dedupeDelegatedNavByPermission(items) {
  const picked = new Map();
  for (const item of items) {
    if (picked.has(item.permission)) continue;
    const preferredTo = DELEGATED_SUPER_ADMIN_NAV_PRIMARY_TO[item.permission];
    if (preferredTo) {
      const preferred = items.find((i) => i.permission === item.permission && i.to === preferredTo);
      picked.set(item.permission, preferred || item);
    } else {
      picked.set(item.permission, item);
    }
  }
  const kept = new Set(picked.values());
  return items.filter((item) => kept.has(item));
}

/** Super-admin shell pages with no /dashboard/admin route — shown in admin sidebar when permitted. */
export function getAdminDelegatedSuperAdminNav(user, hasPermission) {
  const permitted = SUPER_ADMIN_NAV_MAIN.filter(
    (item) =>
      item.permission &&
      !ADMIN_SHELL_PERMISSION_KEYS.has(item.permission) &&
      hasPermission(user, item.permission),
  );
  return dedupeDelegatedNavByPermission(permitted);
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
