/**
 * Resolve staff dashboard base path for Admin vs Super Admin shells.
 * Web-Admin-A1: Admin action pages live under /dashboard/admin/*.
 */
export function getStaffDashboardBase(pathname = "") {
  const p = String(pathname || "");
  if (p === "/dashboard/admin" || p.startsWith("/dashboard/admin/")) {
    return "/dashboard/admin";
  }
  return "/dashboard/super-admin";
}

export function isAdminStaffShell(pathname = "") {
  return getStaffDashboardBase(pathname) === "/dashboard/admin";
}

/** Admin action routes (Flutter Super Admin parity). */
export const ADMIN_ACTION_ROUTES = Object.freeze({
  home: "/dashboard/admin",
  actionCenter: "/dashboard/admin/action-center",
  identity: "/dashboard/admin/identity",
  membershipActivations: "/dashboard/admin/membership-activations",
  packageAssignment: "/dashboard/admin/package-assignment",
  pantry: "/dashboard/admin/pantry",
  articles: "/dashboard/admin/articles",
  feedback: "/dashboard/admin/feedback",
  notifications: "/dashboard/admin/notifications",
  financialClaims: "/dashboard/admin/financial-claims",
});

export function staffIdentityRequestsPath(pathname) {
  return isAdminStaffShell(pathname)
    ? ADMIN_ACTION_ROUTES.identity
    : "/dashboard/super-admin/freelancer-activation-requests";
}

export function staffFeedbackPath(pathname) {
  return isAdminStaffShell(pathname)
    ? ADMIN_ACTION_ROUTES.feedback
    : "/dashboard/super-admin/feedback";
}

export function staffArticlesPath(pathname) {
  return isAdminStaffShell(pathname)
    ? ADMIN_ACTION_ROUTES.articles
    : "/dashboard/super-admin/articles";
}

export function staffPackageAssignmentPath(pathname) {
  return isAdminStaffShell(pathname)
    ? ADMIN_ACTION_ROUTES.packageAssignment
    : "/dashboard/super-admin/subscriptions";
}

export function staffMembershipActivationPath(pathname) {
  return isAdminStaffShell(pathname)
    ? ADMIN_ACTION_ROUTES.membershipActivations
    : "/dashboard/super-admin/subscriptions/activation";
}

export function staffPantryPath(pathname) {
  return isAdminStaffShell(pathname)
    ? ADMIN_ACTION_ROUTES.pantry
    : "/dashboard/super-admin/pantry";
}
