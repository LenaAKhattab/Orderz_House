/** Admin dashboard sidebar navigation (no super_admin-only routes). */
export const ADMIN_NAV_MAIN = [
  { to: "/dashboard/admin", label: "لوحة التحكم", icon: "⌂", end: true },
  { to: "/dashboard/admin/orders", label: "الطلبات الداخلية", icon: "▣", matchPrefix: "/dashboard/admin/orders" },
  { to: "/dashboard/admin/courses", label: "الدورات", icon: "▶", matchPrefix: "/dashboard/admin/courses" },
  { to: "/dashboard/admin/ads", label: "الإعلانات", icon: "✴", end: true, matchPrefix: "/dashboard/admin/ads" },
  { to: "/dashboard/admin/subscriptions", label: "تفعيل الاشتراكات", icon: "✓" },
  { to: "/dashboard/admin/notifications", label: "الإشعارات", icon: "✉" },
];

export const ADMIN_NAV_FOOTER = [
  { to: "/dashboard/admin/settings", label: "الإعدادات", icon: "⚙" },
  { to: "/", label: "الموقع العام", icon: "↗" },
];

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
  if (pathname.includes("/settings")) return "إعدادات الحساب";
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
  if (pathname.includes("/settings")) return [...base, "الإعدادات"].join(" › ");
  return base.join(" › ");
}
