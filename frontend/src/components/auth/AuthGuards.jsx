import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { ROLE } from "../../constants/authRoutes";
import { getPostAuthHomePath, userHasPermission } from "../../constants/dashboardPermissions";
import { AuthRouteSkeleton } from "../ui/AuthRouteSkeleton";
import Unauthorized from "../../pages/Unauthorized";

/**
 * `/dashboard` → redirects to the signed-in user’s role dashboard.
 */
export function DashboardRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return <AuthRouteLoading />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={getPostAuthHomePath(user)} replace />;
}

/**
 * Full-screen loading while session is being restored (no flash of login on refresh).
 */
export function AuthRouteLoading() {
  return <AuthRouteSkeleton />;
}

/**
 * Requires a valid session. Renders nested routes via `<Outlet />`.
 */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AuthRouteLoading />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

/**
 * Only for guests (login/register). Authenticated users go to their dashboard.
 */
export function GuestOnly({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <AuthRouteLoading />;
  }

  if (user) {
    return <Navigate to={getPostAuthHomePath(user)} replace />;
  }

  return children;
}

/**
 * الصفحة الرئيسية "/" للزوار فقط — المستخدم المسجّل يُحوَّل إلى لوحة دوره بـ replace.
 */
export function HomeForGuestsOnly({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <AuthRouteLoading />;
  }

  if (user) {
    return <Navigate to={getPostAuthHomePath(user)} replace />;
  }

  return children;
}

/**
 * Wraps a single route: user must have one of `allowedRoles`.
 * Wrong role → redirect to that user's own dashboard (predictable, no dead ends).
 */
export function RequireRole({ allowedRoles, children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <AuthRouteLoading />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const role = user?.primaryRole || user?.role;
  if (!allowedRoles.includes(role)) {
    return <Navigate to={getPostAuthHomePath(user)} replace />;
  }

  return children;
}

/**
 * Admin dashboard routes: super_admin bypasses; admin must hold `permission`.
 */
export function RequirePermission({ permission, children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <AuthRouteLoading />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const role = user?.primaryRole || user?.role;
  if (role === ROLE.SUPER_ADMIN) {
    return children;
  }

  if (role === ROLE.ADMIN && userHasPermission(user, permission)) {
    return children;
  }

  return (
    <Unauthorized
      title="ليس لديك صلاحية"
      message="ليس لديك صلاحية الوصول إلى هذه الصفحة"
    />
  );
}

/**
 * Staff dashboard page: super_admin always; admin must hold `permission`.
 */
export function RequireStaffPage({ permission, children }) {
  return (
    <RequireRole allowedRoles={[ROLE.SUPER_ADMIN, ROLE.ADMIN]}>
      <RequirePermission permission={permission}>{children}</RequirePermission>
    </RequireRole>
  );
}
