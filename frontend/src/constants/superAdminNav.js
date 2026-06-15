import { formatBreadcrumbTrail } from "../lib/i18n/resolveNavLabel";

export const SUPER_ADMIN_NAV_MAIN = [
  { to: "/dashboard/super-admin", labelKey: "dashboard.nav.superAdmin.overview", icon: "⌂", end: true },
  { to: "/dashboard/super-admin/plans", labelKey: "dashboard.nav.superAdmin.plans", icon: "◆" },
  { to: "/dashboard/super-admin/courses", labelKey: "dashboard.nav.superAdmin.courses", icon: "▶" },
  { to: "/dashboard/super-admin/ads", labelKey: "dashboard.nav.superAdmin.ads", icon: "✴", end: true },
  { to: "/dashboard/super-admin/subscriptions", labelKey: "dashboard.nav.superAdmin.subscriptions", icon: "◎" },
  {
    to: "/dashboard/super-admin/subscriptions/activation",
    labelKey: "dashboard.nav.superAdmin.subscriptionActivation",
    icon: "✓",
  },
  {
    to: "/dashboard/super-admin/financial-claims",
    labelKey: "dashboard.nav.superAdmin.financialClaims",
    icon: "◍",
  },
  { to: "/dashboard/super-admin/orders", labelKey: "dashboard.nav.superAdmin.internalRequests", icon: "▣" },
  {
    to: "/dashboard/super-admin/training-orders",
    labelKey: "dashboard.nav.superAdmin.trainingRequests",
    icon: "✦",
    end: false,
    matchPrefix: "/dashboard/super-admin/training-orders",
  },
  { to: "/dashboard/super-admin/admins", labelKey: "dashboard.nav.superAdmin.admins", icon: "👤", end: true },
  {
    to: "/dashboard/super-admin/edit-website",
    labelKey: "dashboard.nav.superAdmin.editWebsite",
    icon: "✎",
    end: false,
    matchPrefix: "/dashboard/super-admin/edit-website",
  },
];

export function superAdminBreadcrumbKeys(pathname) {
  const base = ["dashboard.breadcrumbs.home"];
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
