import { DASHBOARD_PATH } from "../../constants/authRoutes";

const SUPER_ADMIN_HOME = "/dashboard/super-admin";

/**
 * Dashboard home URL for breadcrumb «الرئيسية» from auth user (`primaryRole` || `role`).
 * @param {{ primaryRole?: string, role?: string } | null | undefined} user
 * @returns {string}
 */
export function breadcrumbHomeFromUser(user) {
  const role = user?.primaryRole || user?.role;
  return DASHBOARD_PATH[role] || "/dashboard/client";
}

/** Two-level trail for super-admin management pages. */
export function superAdminBreadcrumbs(pageLabel) {
  return [
    { label: "الرئيسية", href: SUPER_ADMIN_HOME },
    { label: pageLabel },
  ];
}

/** Training-orders hub (tabs under super-admin). */
export function trainingOrdersBreadcrumbs(sectionLabel) {
  return [
    { label: "الرئيسية", href: SUPER_ADMIN_HOME },
    { label: "الطلبات التجريبية", href: `${SUPER_ADMIN_HOME}/training-orders/settings` },
    { label: sectionLabel },
  ];
}
