/** Primary freelancer dashboard sidebar navigation. */
export const FREELANCER_NAV_MAIN = [
  { to: "/dashboard/freelancer", label: "لوحة التحكم", icon: "dashboard", end: true },
  { to: "/dashboard/freelancer/orders", label: "الطلبات المتاحة", icon: "orders" },
  { to: "/dashboard/freelancer/my-orders", label: "طلباتي", icon: "my-orders" },
  { to: "/dashboard/freelancer/financial-claims", label: "المحفظة", icon: "wallet" },
  { to: "/dashboard/freelancer/plans", label: "الباقات", icon: "plans" },
  { to: "/dashboard/freelancer/notifications", label: "رسائلي", icon: "messages", badgeKey: "notifications" },
  { to: "/dashboard/freelancer/courses", label: "الدورات", icon: "courses" },
];

export const FREELANCER_NAV_FOOTER = [
  { to: "/dashboard/freelancer/settings", label: "الإعدادات", icon: "settings" },
  { to: "/", label: "الموقع العام", icon: "external", external: false },
];

export function isFreelancerDashboardPath(pathname) {
  return String(pathname || "").startsWith("/dashboard/freelancer");
}
