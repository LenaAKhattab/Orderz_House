/** Primary client dashboard sidebar navigation. */
export const CLIENT_NAV_MAIN = [
  { to: "/dashboard/client", label: "لوحة التحكم", icon: "dashboard", end: true },
  { to: "/dashboard/client/my-orders", label: "طلباتي", icon: "my-orders" },
  { to: "/dashboard/client/financial", label: "المالية", icon: "wallet" },
  {
    to: "/dashboard/freelancer/orders",
    label: "معرض الطلبات",
    icon: "orders",
    matchPrefix: "/dashboard/freelancer/orders",
  },
  { to: "/dashboard/client/notifications", label: "رسائلي", icon: "messages", badgeKey: "notifications" },
];

export const CLIENT_NAV_FOOTER = [
  { to: "/dashboard/client/settings", label: "الإعدادات", icon: "settings" },
  { to: "/", label: "الموقع العام", icon: "external", external: false },
];

export function isClientDashboardPath(pathname) {
  return String(pathname || "").startsWith("/dashboard/client");
}

/** Client pool marketplace uses the shared freelancer orders route (browse-only for clients). */
export function isClientDashboardShellPath(pathname) {
  const p = String(pathname || "");
  return isClientDashboardPath(p) || p === "/dashboard/freelancer/orders" || p.startsWith("/dashboard/freelancer/orders/");
}

export function clientPageTitle(pathname) {
  const item = CLIENT_NAV_MAIN.find((n) =>
    n.end ? pathname === n.to : pathname === n.to || pathname.startsWith(`${n.to}/`),
  );
  if (item) return item.label;
  if (pathname.includes("/settings")) return "الإعدادات";
  if (pathname.includes("/profile")) return "الملف الشخصي";
  if (pathname.includes("/financial")) return "المالية";
  if (pathname.includes("/my-orders")) return "طلباتي";
  if (pathname.includes("/freelancer/orders")) return "معرض الطلبات";
  return "لوحة العميل";
}
