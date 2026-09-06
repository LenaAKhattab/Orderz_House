import { ADMIN_PAGE_PERMISSIONS, SUPER_ADMIN_PAGE_PERMISSIONS } from "./dashboardPermissions";
import { formatBreadcrumbTrail } from "../lib/i18n/resolveNavLabel";

/** Individual super-admin sidebar links (keyed for section grouping). */
export const SUPER_ADMIN_NAV_ITEM_DEFS = {
  overview: {
    key: "overview",
    to: "/dashboard/super-admin",
    labelKey: "dashboard.nav.superAdmin.overview",
    icon: "overview",
    end: true,
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.overview,
  },
  analytics: {
    key: "analytics",
    to: "/dashboard/super-admin/analysis",
    labelKey: "dashboard.nav.superAdmin.analysis",
    icon: "analytics",
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.analytics,
  },
  internalRequests: {
    key: "internalRequests",
    to: "/dashboard/super-admin/orders",
    labelKey: "dashboard.nav.superAdmin.internalRequests",
    icon: "internal-requests",
    permission: ADMIN_PAGE_PERMISSIONS.orders,
  },
  trainingRequests: {
    key: "trainingRequests",
    to: "/dashboard/super-admin/training-orders",
    labelKey: "dashboard.nav.superAdmin.trainingRequests",
    icon: "training-requests",
    end: false,
    matchPrefix: "/dashboard/super-admin/training-orders",
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.trainingOrders,
  },
  pantry: {
    key: "pantry",
    to: "/dashboard/super-admin/pantry",
    labelKey: "dashboard.nav.superAdmin.pantry",
    icon: "orders",
    end: false,
    matchPrefix: "/dashboard/super-admin/pantry",
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.pantry,
  },
  articles: {
    key: "articles",
    to: "/dashboard/super-admin/articles",
    labelKey: "dashboard.nav.superAdmin.articles",
    icon: "plans",
    end: true,
    matchPrefix: "/dashboard/super-admin/articles",
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.plans,
  },
  financialClaims: {
    key: "financialClaims",
    to: "/dashboard/super-admin/financial-claims",
    labelKey: "dashboard.nav.superAdmin.financialClaims",
    icon: "financial-claims",
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.financialClaims,
  },
  fazatSettlements: {
    key: "fazatSettlements",
    to: "/dashboard/super-admin/fazat-settlements",
    labelKey: "dashboard.nav.superAdmin.fazatSettlements",
    icon: "financial-claims",
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.financialClaims,
  },
  financialCenter: {
    key: "financialCenter",
    to: "/dashboard/super-admin/financial-center",
    labelKey: "dashboard.nav.superAdmin.financialCenter",
    icon: "financial-center",
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.financialCenter,
  },
  plans: {
    key: "plans",
    to: "/dashboard/super-admin/plans",
    labelKey: "dashboard.nav.superAdmin.plans",
    icon: "plans",
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.plans,
  },
  marketplacePlans: {
    key: "marketplacePlans",
    to: "/dashboard/super-admin/marketplace-plans",
    labelKey: "dashboard.nav.superAdmin.marketplacePlans",
    icon: "plans",
    end: true,
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.plans,
  },
  marketplaceEconomy: {
    key: "marketplaceEconomy",
    to: "/dashboard/super-admin/marketplace-economy",
    labelKey: "dashboard.nav.superAdmin.marketplaceEconomy",
    icon: "plans",
    end: true,
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.plans,
  },
  marketplaceArticles: {
    key: "marketplaceArticles",
    to: "/dashboard/super-admin/article-management",
    labelKey: "dashboard.nav.superAdmin.articleManagement",
    icon: "plans",
    end: true,
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.plans,
  },
  articleManagement: {
    key: "articleManagement",
    to: "/dashboard/super-admin/article-management",
    labelKey: "dashboard.nav.superAdmin.articleManagement",
    icon: "plans",
    end: true,
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.plans,
  },
  freelancerActivation: {
    key: "freelancerActivation",
    to: "/dashboard/super-admin/freelancer-activation",
    labelKey: "dashboard.nav.superAdmin.freelancerActivation",
    icon: "plans",
    end: true,
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.plans,
  },
  freelancerActivationRequests: {
    key: "freelancerActivationRequests",
    to: "/dashboard/super-admin/freelancer-activation-requests",
    labelKey: "dashboard.nav.superAdmin.freelancerActivationRequests",
    icon: "subscription-activation",
    end: true,
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.plans,
  },
  bildazoAuthorLinks: {
    key: "bildazoAuthorLinks",
    to: "/dashboard/super-admin/bildazo-author-links",
    labelKey: "dashboard.nav.superAdmin.bildazoAuthorLinks",
    icon: "plans",
    end: true,
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.plans,
  },
  // Route remains available; hidden from sidebar for now.
  bidCredits: {
    key: "bidCredits",
    to: "/dashboard/super-admin/bid-credits",
    labelKey: "dashboard.nav.superAdmin.bidCredits",
    icon: "plans",
    end: true,
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.plans,
    hidden: true,
  },
  subscriptions: {
    key: "subscriptions",
    to: "/dashboard/super-admin/subscriptions",
    labelKey: "dashboard.nav.superAdmin.subscriptions",
    icon: "subscriptions",
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.subscriptions,
  },
  /** @deprecated Web-Admin-A2 — not in primary sidebar; route kept for legacy deep links. */
  subscriptionActivation: {
    key: "subscriptionActivation",
    to: "/dashboard/super-admin/subscriptions/activation",
    labelKey: "dashboard.nav.superAdmin.subscriptionActivation",
    icon: "subscription-activation",
    permission: ADMIN_PAGE_PERMISSIONS.subscriptionActivation,
  },
  courses: {
    key: "courses",
    to: "/dashboard/super-admin/courses",
    labelKey: "dashboard.nav.superAdmin.courses",
    icon: "courses",
    permission: ADMIN_PAGE_PERMISSIONS.courses,
  },
  ads: {
    key: "ads",
    to: "/dashboard/super-admin/ads",
    labelKey: "dashboard.nav.superAdmin.ads",
    icon: "ads",
    end: true,
    permission: ADMIN_PAGE_PERMISSIONS.ads,
  },
  editWebsite: {
    key: "editWebsite",
    to: "/dashboard/super-admin/edit-website",
    labelKey: "dashboard.nav.superAdmin.editWebsite",
    icon: "edit-website",
    end: false,
    matchPrefix: "/dashboard/super-admin/edit-website",
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.editWebsite,
  },
  admins: {
    key: "admins",
    to: "/dashboard/super-admin/admins",
    labelKey: "dashboard.nav.superAdmin.admins",
    icon: "admins",
    end: true,
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.adminsManage,
  },
  rateLimitExemptions: {
    key: "rateLimitExemptions",
    to: "/dashboard/super-admin/rate-limit-exemptions",
    labelKey: "dashboard.nav.superAdmin.rateLimitExemptions",
    icon: "rate-limit-exemptions",
    end: true,
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.rateLimitExemptions,
  },
  onboarding: {
    key: "onboarding",
    to: "/dashboard/super-admin/onboarding",
    labelKey: "dashboard.nav.superAdmin.onboarding",
    icon: "edit-website",
    end: true,
  },
  problemsSuggestions: {
    key: "problemsSuggestions",
    to: "/dashboard/super-admin/feedback",
    labelKey: "dashboard.nav.superAdmin.problemsSuggestions",
    icon: "problems-suggestions",
    end: false,
    matchPrefix: "/dashboard/super-admin/feedback",
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.problemsSuggestions,
  },
  institutions: {
    key: "institutions",
    to: "/dashboard/super-admin/institutions",
    labelKey: "dashboard.nav.superAdmin.institutionsManagement",
    icon: "institutions",
    end: true,
    matchPrefix: "/dashboard/super-admin/institutions",
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.institutions,
  },
  institutionalOrderStorage: {
    key: "institutionalOrderStorage",
    to: "/dashboard/super-admin/institutional-order-storage",
    labelKey: "dashboard.nav.superAdmin.institutionalOrderStorage",
    icon: "institutional-order-storage",
    end: false,
    matchPrefix: "/dashboard/super-admin/institutional-order-storage",
    permission: SUPER_ADMIN_PAGE_PERMISSIONS.institutionalOrderStorage,
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
    itemKeys: ["internalRequests", "trainingRequests", "pantry", "articles"],
    showCreateOrder: true,
  },
  {
    id: "financeAdmin",
    labelKey: "dashboard.nav.sections.financeAdmin",
    itemKeys: ["financialCenter", "financialClaims", "fazatSettlements"],
  },
  {
    id: "usersSubscriptions",
    labelKey: "dashboard.nav.sections.usersSubscriptions",
    // Web-Admin-A2: subscriptionActivation removed from primary nav (Stripe auto-activate).
    itemKeys: ["plans", "marketplacePlans", "marketplaceEconomy", "freelancerActivationRequests", "bildazoAuthorLinks", "subscriptions"],
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
    id: "institutions",
    labelKey: "dashboard.nav.sections.institutions",
    itemKeys: ["institutions", "institutionalOrderStorage"],
  },
  {
    id: "administration",
    labelKey: "dashboard.nav.sections.administration",
    itemKeys: ["admins", "rateLimitExemptions", "onboarding", "problemsSuggestions"],
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
  return items.filter(
    (item) => !item.hidden && (!item.permission || hasPermission(user, item.permission)),
  );
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
  if (pathname.includes("/marketplace-economy")) {
    return [...base, "dashboard.breadcrumbs.marketplaceEconomy"];
  }
  if (pathname.includes("/bildazo-author-links")) {
    return [...base, "dashboard.breadcrumbs.bildazoAuthorLinks"];
  }
  if (pathname.includes("/freelancer-activation-requests")) {
    return [...base, "dashboard.breadcrumbs.freelancerActivationRequests"];
  }
  if (pathname.includes("/freelancer-activation")) {
    return [...base, "dashboard.breadcrumbs.freelancerActivation"];
  }
  if (
    pathname.includes("/articles") ||
    pathname.includes("/article-management") ||
    pathname.includes("/marketplace-articles")
  ) {
    return [...base, "dashboard.breadcrumbs.articles"];
  }
  if (pathname.includes("/bid-credits")) {
    return [...base, "dashboard.breadcrumbs.bidCredits"];
  }
  if (pathname.includes("/marketplace-plans")) {
    return [...base, "dashboard.breadcrumbs.managePlans"];
  }
  if (pathname.includes("/training-packages")) {
    return [...base, "dashboard.breadcrumbs.managePlans"];
  }
  if (pathname.includes("/special-offer-package")) {
    return [...base, "dashboard.breadcrumbs.managePlans"];
  }
  if (pathname.includes("/plans")) return [...base, "dashboard.breadcrumbs.plans"];
  if (pathname.includes("/courses")) return [...base, "dashboard.breadcrumbs.courses"];
  if (pathname.includes("/super-admin/ads")) return [...base, "dashboard.breadcrumbs.ads"];
  if (pathname.includes("/subscriptions")) return [...base, "dashboard.breadcrumbs.freelancerSubscriptions"];
  if (pathname.includes("/orders/create")) {
    return [...base, "dashboard.breadcrumbs.internalRequests", "dashboard.breadcrumbs.createInternalRequest"];
  }
  if (pathname.includes("/onboarding")) {
    return [...base, "dashboard.breadcrumbs.onboarding"];
  }
  if (pathname.includes("/rate-limit-exemptions")) {
    return [...base, "dashboard.breadcrumbs.rateLimitExemptions"];
  }
  if (pathname.includes("/feedback/")) {
    return [...base, "dashboard.breadcrumbs.problemsSuggestions", "dashboard.breadcrumbs.feedbackDetails"];
  }
  if (pathname.includes("/feedback")) {
    return [...base, "dashboard.breadcrumbs.problemsSuggestions"];
  }
  if (pathname.includes("/institutional-order-storage")) {
    return [...base, "dashboard.nav.superAdmin.institutionalOrderStorage"];
  }
  if (pathname.includes("/institutions")) {
    return [...base, "dashboard.breadcrumbs.institutions"];
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
  if (pathname.includes("/edit-website/footer/contact-center")) {
    return [
      ...base,
      "dashboard.breadcrumbs.editWebsite",
      "dashboard.breadcrumbs.editFooter",
      "dashboard.breadcrumbs.footerContactCenter",
    ];
  }
  if (pathname.includes("/edit-website/footer/contact")) {
    return [
      ...base,
      "dashboard.breadcrumbs.editWebsite",
      "dashboard.breadcrumbs.editFooter",
      "dashboard.breadcrumbs.footerContact",
    ];
  }
  if (pathname.includes("/edit-website/footer/working-hours")) {
    return [
      ...base,
      "dashboard.breadcrumbs.editWebsite",
      "dashboard.breadcrumbs.editFooter",
      "dashboard.breadcrumbs.footerWorkingHours",
    ];
  }
  if (
    pathname.includes("/edit-website/footer/app-downloads") ||
    pathname.includes("/edit-website/footer-app-downloads")
  ) {
    return [
      ...base,
      "dashboard.breadcrumbs.editWebsite",
      "dashboard.breadcrumbs.editFooter",
      "dashboard.breadcrumbs.footerAppDownloads",
    ];
  }
  if (pathname.includes("/edit-website/footer")) {
    return [...base, "dashboard.breadcrumbs.editWebsite", "dashboard.breadcrumbs.editFooter"];
  }
  if (pathname.includes("/edit-website")) return [...base, "dashboard.breadcrumbs.editWebsite"];
  if (pathname.includes("/training-orders")) return [...base, "dashboard.breadcrumbs.trainingRequests"];
  if (pathname.includes("/financial-center/employees/")) {
    return [...base, "dashboard.breadcrumbs.financialCenter", "dashboard.financialCenter.employeeDetail.breadcrumb"];
  }
  if (pathname.includes("/financial-center")) return [...base, "dashboard.breadcrumbs.financialCenter"];
  if (pathname.includes("/fazat-settlements")) return [...base, "dashboard.breadcrumbs.fazatSettlements"];
  if (pathname.includes("/financial-claims")) return [...base, "dashboard.breadcrumbs.financialClaims"];
  if (pathname.includes("/orders")) return [...base, "dashboard.breadcrumbs.internalRequests"];
  return base;
}

export function superAdminBreadcrumb(pathname, t) {
  return formatBreadcrumbTrail(superAdminBreadcrumbKeys(pathname), t);
}
