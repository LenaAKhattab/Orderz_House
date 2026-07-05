import { ADMIN_PAGE_PERMISSIONS, SUPER_ADMIN_PAGE_PERMISSIONS } from "./dashboardPermissions";
import { formatBreadcrumbTrail } from "../lib/i18n/resolveNavLabel";

/** Individual super-admin sidebar links (keyed for section grouping). */
export const SUPER_ADMIN_NAV_ITEM_DEFS = {
  overview: {
    key: "overview",
    to: "/dashboard/super-admin",
    labelKey: "dashboard.nav.superAdmin.overview",
    icon: "⌂",
    end: true,
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.overview,
  },
  analytics: {
    key: "analytics",
    to: "/dashboard/super-admin/analysis",
    labelKey: "dashboard.nav.superAdmin.analysis",
    icon: "◈",
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.analytics,
  },
  internalRequests: {
    key: "internalRequests",
    to: "/dashboard/super-admin/orders",
    labelKey: "dashboard.nav.superAdmin.internalRequests",
    icon: "▣",
    permission: ADMIN_PAGE_PERMISSIONS.orders,
  },
  trainingRequests: {
    key: "trainingRequests",
    to: "/dashboard/super-admin/training-orders",
    labelKey: "dashboard.nav.superAdmin.trainingRequests",
    icon: "✦",
    end: false,
    matchPrefix: "/dashboard/super-admin/training-orders",
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.trainingOrders,
  },
  financialClaims: {
    key: "financialClaims",
    to: "/dashboard/super-admin/financial-claims",
    labelKey: "dashboard.nav.superAdmin.financialClaims",
    icon: "◍",
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.financialClaims,
  },
  plans: {
    key: "plans",
    to: "/dashboard/super-admin/plans",
    labelKey: "dashboard.nav.superAdmin.plans",
    icon: "◆",
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.plans,
  },
  subscriptions: {
    key: "subscriptions",
    to: "/dashboard/super-admin/subscriptions",
    labelKey: "dashboard.nav.superAdmin.subscriptions",
    icon: "◎",
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.subscriptions,
  },
  subscriptionActivation: {
    key: "subscriptionActivation",
    to: "/dashboard/super-admin/subscriptions/activation",
    labelKey: "dashboard.nav.superAdmin.subscriptionActivation",
    icon: "✓",
    permission: ADMIN_PAGE_PERMISSIONS.subscriptionActivation,
  },
  courses: {
    key: "courses",
    to: "/dashboard/super-admin/courses",
    labelKey: "dashboard.nav.superAdmin.courses",
    icon: "▶",
    permission: ADMIN_PAGE_PERMISSIONS.courses,
  },
  ads: {
    key: "ads",
    to: "/dashboard/super-admin/ads",
    labelKey: "dashboard.nav.superAdmin.ads",
    icon: "✴",
    end: true,
    permission: ADMIN_PAGE_PERMISSIONS.ads,
  },
  editWebsite: {
    key: "editWebsite",
    to: "/dashboard/super-admin/edit-website",
    labelKey: "dashboard.nav.superAdmin.editWebsite",
    icon: "✎",
    end: false,
    matchPrefix: "/dashboard/super-admin/edit-website",
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.editWebsite,
  },
  admins: {
    key: "admins",
    to: "/dashboard/super-admin/admins",
    labelKey: "dashboard.nav.superAdmin.admins",
    icon: "👤",
    end: true,
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.adminsManage,
  },
};

export const SUPER_ADMIN_NAV_SECTION_DEFS = [
  {
    id: "overview",
    labelKey: "dashboard.nav.sections.overview",
    itemKeys: ["overview", "analytics"],
  },
  {
    id: "ordersOps",
    labelKey: "dashboard.nav.sections.ordersOps",
    itemKeys: ["internalRequests", "trainingRequests", "financialClaims"],
    showCreateOrder: true,
  },
  {
    id: "usersSubscriptions",
    labelKey: "dashboard.nav.sections.usersSubscriptions",
    itemKeys: ["plans", "subscriptions", "subscriptionActivation"],
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

function resolveNavItems(itemKeys, defs = SUPER_ADMIN_NAV_ITEM_DEFS) {
  return itemKeys.map((key) => defs[key]).filter(Boolean);
}

/** Flat list — preserved for delegated admin nav and legacy imports. */
export const SUPER_ADMIN_NAV_MAIN = SUPER_ADMIN_NAV_SECTION_DEFS.flatMap((section) =>
  resolveNavItems(section.itemKeys),
);

/** Sidebar create-request action — permission-gated like admin create-order nav. */
export const SUPER_ADMIN_NAV_CREATE_ORDER = {
  permission: ADMIN_PAGE_PERMISSIONS.createOrder,
};

export function filterSuperAdminNavItems(items, user, hasPermission) {
  return items.filter((item) => !item.permission || hasPermission(user, item.permission));
}

export function filterSuperAdminNavSections(user, hasPermission) {
  return SUPER_ADMIN_NAV_SECTION_DEFS.map((section) => ({
    ...section,
    items: filterSuperAdminNavItems(resolveNavItems(section.itemKeys), user, hasPermission),
  })).filter((section) => section.items.length > 0 || section.showCreateOrder);
}

export function superAdminBreadcrumbKeys(pathname) {
  const base = ["dashboard.breadcrumbs.home"];
  if (pathname.includes("/analysis")) return [...base, "dashboard.breadcrumbs.analytics"];
  if (pathname.includes("/subscriptions/activation")) {
    return [...base, "dashboard.breadcrumbs.subscriptionActivation"];
  }
  if (pathname.includes("/plans")) return [...base, "dashboard.breadcrumbs.plans"];
  if (pathname.includes("/courses")) return [...base, "dashboard.breadcrumbs.courses"];
  if (pathname.includes("/super-admin/ads")) return [...base, "dashboard.breadcrumbs.ads"];
  if (pathname.includes("/subscriptions")) return [...base, "dashboard.breadcrumbs.freelancerSubscriptions"];
  if (pathname.includes("/orders/create")) {
    return [...base, "dashboard.breadcrumbs.internalRequests", "dashboard.breadcrumbs.createInternalRequest"];
  }
  if (pathname.includes("/admins")) return [...base, "dashboard.breadcrumbs.admins"];
  if (pathname.includes("/edit-website/how-it-works/")) {
    return [
      ...base,
      "dashboard.breadcrumbs.editWebsite",
      "dashboard.breadcrumbs.howItWorks",
      "dashboard.breadcrumbs.howItWorksEditor",
    ];
  }
  if (pathname.includes("/edit-website/how-it-works")) {
    return [...base, "dashboard.breadcrumbs.editWebsite", "dashboard.breadcrumbs.howItWorks"];
  }
  if (pathname.includes("/edit-website/faq")) {
    return [...base, "dashboard.breadcrumbs.editWebsite", "dashboard.breadcrumbs.faq"];
  }
  if (pathname.includes("/edit-website")) return [...base, "dashboard.breadcrumbs.editWebsite"];
  if (pathname.includes("/training-orders")) return [...base, "dashboard.breadcrumbs.trainingRequests"];
  if (pathname.includes("/financial-claims")) return [...base, "dashboard.breadcrumbs.financialClaims"];
  if (pathname.includes("/orders")) return [...base, "dashboard.breadcrumbs.internalRequests"];
  return base;
}

export function superAdminBreadcrumb(pathname, t) {
  return formatBreadcrumbTrail(superAdminBreadcrumbKeys(pathname), t);
}
