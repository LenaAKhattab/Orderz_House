import { resolveNavLabel } from "../lib/i18n/resolveNavLabel";

/** Primary freelancer dashboard sidebar navigation. */
export const FREELANCER_NAV_MAIN = [
  { to: "/dashboard/freelancer", labelKey: "dashboard.nav.freelancer.home", icon: "dashboard", end: true },
  { to: "/dashboard/freelancer/orders", labelKey: "dashboard.nav.freelancer.availableRequests", icon: "orders" },
  {
    to: "/dashboard/freelancer/institution-orders",
    labelKey: "dashboard.nav.freelancer.institutionOrders",
    icon: "orders",
    requiresInstitutionMembership: true,
  },
  { to: "/dashboard/freelancer/my-orders", labelKey: "dashboard.nav.freelancer.myRequests", icon: "my-orders" },
  { to: "/dashboard/freelancer/articles", labelKey: "dashboard.nav.freelancer.articles", icon: "orders" },
  { to: "/dashboard/freelancer/financial-claims", labelKey: "dashboard.nav.freelancer.wallet", icon: "wallet" },
  { to: "/dashboard/freelancer/plans", labelKey: "dashboard.nav.freelancer.plans", icon: "plans" },
  {
    to: "/dashboard/freelancer/notifications",
    labelKey: "dashboard.nav.freelancer.messages",
    icon: "messages",
    badgeKey: "notifications",
  },
  { to: "/dashboard/freelancer/courses", labelKey: "dashboard.nav.freelancer.courses", icon: "courses" },
  {
    to: "/dashboard/freelancer/feedback",
    labelKey: "dashboard.nav.freelancer.problemsSuggestions",
    icon: "feedback",
  },
];

export const FREELANCER_NAV_FOOTER = [
  { to: "/dashboard/freelancer/settings", labelKey: "dashboard.nav.common.settings", icon: "settings" },
  { to: "/", labelKey: "dashboard.nav.common.backToWebsite", icon: "external", external: false },
];

export function isFreelancerDashboardPath(pathname) {
  return String(pathname || "").startsWith("/dashboard/freelancer");
}

export function freelancerPageTitle(pathname, t) {
  const item = FREELANCER_NAV_MAIN.find((n) =>
    n.end ? pathname === n.to : pathname === n.to || pathname.startsWith(`${n.to}/`),
  );
  if (item) return resolveNavLabel(item, t);
  if (pathname.includes("/settings")) return t("dashboard.nav.common.settings");
  if (pathname.includes("/feedback")) return t("dashboard.nav.freelancer.problemsSuggestions");
  if (pathname.includes("/institution-orders")) return t("dashboard.nav.freelancer.institutionOrders");
  if (pathname.includes("/financial-claims")) return t("dashboard.nav.freelancer.wallet");
  if (pathname.includes("/orders/")) return t("dashboard.nav.freelancer.requestDetails");
  if (pathname.includes("/my-orders/")) return t("dashboard.nav.freelancer.myRequests");
  if (pathname.includes("/courses/")) return t("dashboard.nav.freelancer.courseDetails");
  if (pathname.includes("/articles")) return t("dashboard.nav.freelancer.articles");
  return t("dashboard.nav.freelancer.panelTitle");
}
