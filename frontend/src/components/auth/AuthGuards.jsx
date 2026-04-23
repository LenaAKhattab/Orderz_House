import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { getDashboardPath } from "../../constants/authRoutes";
import { AuthRouteSkeleton } from "../ui/Skeleton";

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

  const role = user?.primaryRole || user?.role;
  return <Navigate to={getDashboardPath(role)} replace />;
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
    const role = user?.primaryRole || user?.role;
    return <Navigate to={getDashboardPath(role)} replace />;
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
    return <Navigate to={getDashboardPath(role)} replace />;
  }

  return children;
}
