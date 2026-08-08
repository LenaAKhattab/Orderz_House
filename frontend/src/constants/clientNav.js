import { resolveNavLabel } from "../lib/i18n/resolveNavLabel";

/** Primary client dashboard sidebar navigation. */
export const CLIENT_NAV_MAIN = [
  { to: "/dashboard/client", labelKey: "dashboard.nav.client.home", icon: "dashboard", end: true },
  { to: "/dashboard/client/my-orders", labelKey: "dashboard.nav.client.myRequests", icon: "my-orders" },
  { to: "/dashboard/client/financial", labelKey: "dashboard.nav.client.finance", icon: "wallet" },
  {
    to: "/dashboard/client/orders",
    labelKey: "dashboard.nav.client.requestMarketplace",
    icon: "orders",
    matchPrefix: "/dashboard/client/orders",
  },
  {
    to: "/dashboard/client/notifications",
    labelKey: "dashboard.nav.client.messages",
    icon: "messages",
    badgeKey: "notifications",
  },
  {
    to: "/dashboard/client/feedback",
    labelKey: "dashboard.nav.client.problemsSuggestions",
    icon: "feedback",
  },
];

export const CLIENT_NAV_FOOTER = [
  { to: "/dashboard/client/settings", labelKey: "dashboard.nav.common.settings", icon: "settings" },
  { to: "/", labelKey: "dashboard.nav.common.backToWebsite", icon: "external", external: false },
];

export function isClientDashboardPath(pathname) {
  return String(pathname || "").startsWith("/dashboard/client");
}

/** Client pool marketplace uses the shared freelancer orders route (browse-only for clients). */
export function isClientDashboardShellPath(pathname) {
  const p = String(pathname || "");
  return (
    isClientDashboardPath(p) ||
    p === "/dashboard/client/orders" ||
    p.startsWith("/dashboard/client/orders/") ||
    p === "/dashboard/freelancer/orders" ||
    p.startsWith("/dashboard/freelancer/orders/")
  );
}

export function clientPageTitle(pathname, t) {
  const item = CLIENT_NAV_MAIN.find((n) =>
    n.end ? pathname === n.to : pathname === n.to || pathname.startsWith(`${n.to}/`),
  );
  if (item) return resolveNavLabel(item, t);
  if (pathname.includes("/settings")) return t("dashboard.nav.common.settings");
  if (pathname.includes("/feedback")) return t("dashboard.nav.client.problemsSuggestions");
  if (pathname.includes("/profile")) return t("dashboard.nav.common.profile");
  if (pathname.includes("/financial")) return t("dashboard.nav.client.finance");
  if (pathname.includes("/my-orders")) return t("dashboard.nav.client.myRequests");
  if (pathname.includes("/client/orders") || pathname.includes("/freelancer/orders")) {
    return t("dashboard.nav.client.requestMarketplace");
  }
  return t("dashboard.nav.client.panelTitle");
}
