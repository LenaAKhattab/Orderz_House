import { DASHBOARD_PATH } from "../../constants/authRoutes";

const SUPER_ADMIN_HOME = "/dashboard/super-admin";

/**
 * Dashboard home URL for breadcrumb home link from auth user (`primaryRole` || `role`).
 * @param {{ primaryRole?: string, role?: string } | null | undefined} user
 * @returns {string}
 */
export function breadcrumbHomeFromUser(user) {
  const role = user?.primaryRole || user?.role;
  return DASHBOARD_PATH[role] || "/dashboard/client";
}

/** Home breadcrumb crumb for layout chrome. */
export function breadcrumbHomeCrumb(user) {
  return { labelKey: "dashboard.breadcrumbs.home", href: breadcrumbHomeFromUser(user) };
}

/** Two-level trail for super-admin management pages. */
export function superAdminBreadcrumbs(pageLabelKey) {
  return [
    { labelKey: "dashboard.breadcrumbs.home", href: SUPER_ADMIN_HOME },
    { labelKey: pageLabelKey },
  ];
}

/** Edit-website hub (tabs under super-admin). */
export function editWebsiteBreadcrumbs(sectionLabelKey) {
  return [
    { labelKey: "dashboard.breadcrumbs.home", href: SUPER_ADMIN_HOME },
    { labelKey: "dashboard.breadcrumbs.editWebsite", href: `${SUPER_ADMIN_HOME}/edit-website` },
    { labelKey: sectionLabelKey },
  ];
}

/** Footer subsections under edit-website/footer. */
export function editWebsiteFooterBreadcrumbs(sectionLabelKey) {
  return [
    { labelKey: "dashboard.breadcrumbs.home", href: SUPER_ADMIN_HOME },
    { labelKey: "dashboard.breadcrumbs.editWebsite", href: `${SUPER_ADMIN_HOME}/edit-website` },
    { labelKey: "dashboard.breadcrumbs.editFooter", href: `${SUPER_ADMIN_HOME}/edit-website/footer` },
    { labelKey: sectionLabelKey },
  ];
}

/** Training-orders hub (tabs under super-admin). */
export function trainingOrdersBreadcrumbs(sectionLabelKey) {
  return [
    { labelKey: "dashboard.breadcrumbs.home", href: SUPER_ADMIN_HOME },
    { labelKey: "dashboard.breadcrumbs.trainingRequests", href: `${SUPER_ADMIN_HOME}/training-orders` },
    { labelKey: sectionLabelKey },
  ];
}
