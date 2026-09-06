import { ROLE, canRoleAccessPath } from "./authRoutes";
import { ADMIN_PAGE_PERMISSIONS, SUPER_ADMIN_PAGE_PERMISSIONS } from "./dashboardPermissions";
import {
  SUPER_ADMIN_NAV_ITEM_DEFS,
  SUPER_ADMIN_NAV_MAIN,
} from "./superAdminNav";
import { formatBreadcrumbTrail } from "../lib/i18n/resolveNavLabel";
import { ADMIN_ACTION_ROUTES } from "../lib/staff/staffDashboardPaths";

/** Always visible — admin Action Center (no page permission). */
export const ADMIN_NAV_HOME = {
  key: "home",
  to: ADMIN_ACTION_ROUTES.home,
  labelKey: "dashboard.nav.admin.actionCenter",
  icon: "home",
  end: true,
  permission: null,
};

/** Always visible — personal notifications (no page permission). */
export const ADMIN_NAV_NOTIFICATIONS = {
  key: "notifications",
  to: ADMIN_ACTION_ROUTES.notifications,
  labelKey: "dashboard.nav.common.notifications",
  icon: "notifications",
  permission: null,
};

/** Web-Admin-A1 action pages — always visible for role admin (Flutter Super Admin parity). */
export const ADMIN_NAV_ACTION_ITEM_DEFS = {
  identity: {
    key: "identity",
    to: ADMIN_ACTION_ROUTES.identity,
    labelKey: "dashboard.nav.admin.identity",
    icon: "identity",
    matchPrefix: ADMIN_ACTION_ROUTES.identity,
    permission: null,
  },
  packageAssignment: {
    key: "packageAssignment",
    to: ADMIN_ACTION_ROUTES.packageAssignment,
    labelKey: "dashboard.nav.admin.packageAssignment",
    icon: "subscriptions",
    matchPrefix: ADMIN_ACTION_ROUTES.packageAssignment,
    permission: null,
  },
  pantry: {
    key: "pantry",
    to: ADMIN_ACTION_ROUTES.pantry,
    labelKey: "dashboard.nav.admin.pantry",
    icon: "pantry",
    matchPrefix: ADMIN_ACTION_ROUTES.pantry,
    permission: null,
  },
  articles: {
    key: "articles",
    to: ADMIN_ACTION_ROUTES.articles,
    labelKey: "dashboard.nav.admin.articles",
    icon: "articles",
    matchPrefix: ADMIN_ACTION_ROUTES.articles,
    permission: null,
  },
  feedback: {
    key: "feedback",
    to: ADMIN_ACTION_ROUTES.feedback,
    labelKey: "dashboard.nav.admin.feedback",
    icon: "feedback",
    matchPrefix: ADMIN_ACTION_ROUTES.feedback,
    permission: null,
  },
};

export const ADMIN_NAV_ITEM_DEFS = {
  home: ADMIN_NAV_HOME,
  ...ADMIN_NAV_ACTION_ITEM_DEFS,
  internalRequests: {
    key: "internalRequests",
    to: "/dashboard/admin/orders",
    labelKey: "dashboard.nav.admin.internalRequests",
    icon: "internal-requests",
    matchPrefix: "/dashboard/admin/orders",
    permission: ADMIN_PAGE_PERMISSIONS.orders,
  },
  createOrder: {
    key: "createOrder",
    to: "/dashboard/admin/orders/create",
    labelKey: "dashboard.nav.admin.createInternalRequest",
    icon: "create-order",
    permission: ADMIN_PAGE_PERMISSIONS.createOrder,
  },
  courses: {
    key: "courses",
    to: "/dashboard/admin/courses",
    labelKey: "dashboard.nav.admin.courses",
    icon: "courses",
    matchPrefix: "/dashboard/admin/courses",
    permission: ADMIN_PAGE_PERMISSIONS.courses,
  },
  ads: {
    key: "ads",
    to: "/dashboard/admin/ads",
    labelKey: "dashboard.nav.admin.ads",
    icon: "ads",
    end: true,
    matchPrefix: "/dashboard/admin/ads",
    permission: ADMIN_PAGE_PERMISSIONS.ads,
  },
  /** @deprecated Web-Admin-A2 — kept for legacy deep-link titles only; not in sidebar. */
  subscriptionActivation: {
    key: "subscriptionActivation",
    to: "/dashboard/admin/subscriptions",
    labelKey: "dashboard.nav.admin.subscriptions",
    icon: "subscription-activation",
    permission: ADMIN_PAGE_PERMISSIONS.subscriptionActivation,
  },
  subscriptions: SUPER_ADMIN_NAV_ITEM_DEFS.subscriptions,
  trainingRequests: SUPER_ADMIN_NAV_ITEM_DEFS.trainingRequests,
  financialClaims: SUPER_ADMIN_NAV_ITEM_DEFS.financialClaims,
  fazatSettlements: SUPER_ADMIN_NAV_ITEM_DEFS.fazatSettlements,
  financialCenter: SUPER_ADMIN_NAV_ITEM_DEFS.financialCenter,
  editWebsite: SUPER_ADMIN_NAV_ITEM_DEFS.editWebsite,
  admins: SUPER_ADMIN_NAV_ITEM_DEFS.admins,
};

export const ADMIN_NAV_SECTION_DEFS = [
  {
    id: "overview",
    labelKey: "dashboard.nav.sections.overview",
    itemKeys: ["home"],
  },
  {
    id: "actionCenter",
    labelKey: "dashboard.nav.sections.actionTasks",
    itemKeys: [
      "identity",
      "packageAssignment",
      "pantry",
      "articles",
      "feedback",
    ],
  },
  {
    id: "ordersOps",
    labelKey: "dashboard.nav.sections.ordersOps",
    itemKeys: ["internalRequests", "createOrder", "trainingRequests"],
  },
  {
    id: "financeAdmin",
    labelKey: "dashboard.nav.sections.financeAdmin",
    itemKeys: ["financialCenter", "financialClaims", "fazatSettlements"],
  },
  {
    id: "contentTraining",
    labelKey: "dashboard.nav.sections.contentTraining",
    itemKeys: ["courses", "ads"],
  },
  {
    id: "websiteSettings",
    labelKey: "dashboard.nav.sections.websiteSettings",
    itemKeys: ["editWebsite"],
  },
  {
    id: "administration",
    labelKey: "dashboard.nav.sections.administration",
    itemKeys: ["admins"],
  },
];

function resolveAdminNavItems(itemKeys) {
  return itemKeys.map((key) => ADMIN_NAV_ITEM_DEFS[key]).filter(Boolean);
}

/** Permission-gated business pages on /dashboard/admin/* (flat list). */
export const ADMIN_NAV_MAIN = resolveAdminNavItems([
  "identity",
  "packageAssignment",
  "pantry",
  "articles",
  "feedback",
  "internalRequests",
  "courses",
  "ads",
]);

export const ADMIN_NAV_CREATE_ORDER = ADMIN_NAV_ITEM_DEFS.createOrder;

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

export function filterAdminNavSections(user, hasPermission) {
  return ADMIN_NAV_SECTION_DEFS.map((section) => ({
    ...section,
    items: filterAdminNavItems(resolveAdminNavItems(section.itemKeys), user, hasPermission),
  })).filter((section) => section.items.length > 0);
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
  return dedupeDelegatedNavByPermission(permitted).filter((item) =>
    canRoleAccessPath(item.to, ROLE.ADMIN),
  );
}

export function isAdminDashboardPath(pathname) {
  const p = String(pathname || "");
  return p === "/dashboard/admin" || p.startsWith("/dashboard/admin/");
}

export function adminPageTitle(pathname, t) {
  if (pathname.includes("/action-center")) return t("dashboard.nav.admin.actionCenter");
  if (pathname.includes("/identity")) return t("dashboard.nav.admin.identity");
  if (pathname.includes("/membership-activations")) return t("dashboard.nav.admin.membershipActivations");
  if (pathname.includes("/package-assignment")) return t("dashboard.nav.admin.packageAssignment");
  if (pathname.includes("/orders/create")) return t("dashboard.breadcrumbs.createInternalRequest");
  if (pathname.includes("/orders")) return t("dashboard.breadcrumbs.internalRequests");
  if (pathname.includes("/pantry")) return t("dashboard.nav.admin.pantry");
  if (pathname.includes("/articles")) return t("dashboard.nav.admin.articles");
  if (pathname.includes("/feedback")) return t("dashboard.nav.admin.feedback");
  if (pathname.includes("/settings")) return t("dashboard.nav.common.settings");
  if (pathname.includes("/courses")) return t("dashboard.breadcrumbs.courses");
  if (pathname.includes("/ads")) return t("dashboard.breadcrumbs.ads");
  if (pathname.includes("/subscriptions")) return t("dashboard.breadcrumbs.subscriptionActivation");
  if (pathname.includes("/notifications")) return t("dashboard.breadcrumbs.notifications");
  if (pathname === "/dashboard/admin") return t("dashboard.nav.admin.actionCenter");
  return t("dashboard.nav.admin.panelTitle");
}

export function adminBreadcrumbKeys(pathname) {
  const base = ["dashboard.breadcrumbs.adminHome"];
  if (pathname.includes("/action-center")) return [...base, "dashboard.breadcrumbs.actionCenter"];
  if (pathname.includes("/identity")) return [...base, "dashboard.breadcrumbs.identityVerification"];
  if (pathname.includes("/membership-activations")) {
    return [...base, "dashboard.breadcrumbs.membershipActivations"];
  }
  if (pathname.includes("/package-assignment")) return [...base, "dashboard.breadcrumbs.packageAssignment"];
  if (pathname.includes("/orders/create")) {
    return [...base, "dashboard.breadcrumbs.internalRequests", "dashboard.breadcrumbs.createInternalRequest"];
  }
  if (pathname.includes("/orders")) return [...base, "dashboard.breadcrumbs.internalRequests"];
  if (pathname.includes("/pantry")) return [...base, "dashboard.breadcrumbs.pantry"];
  if (pathname.includes("/articles")) return [...base, "dashboard.breadcrumbs.articles"];
  if (pathname.includes("/feedback")) return [...base, "dashboard.breadcrumbs.problemsSuggestions"];
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
