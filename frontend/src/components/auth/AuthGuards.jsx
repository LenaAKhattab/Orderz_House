import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getDashboardPath } from "../../constants/authRoutes";

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

  return <Navigate to={getDashboardPath(user.role)} replace />;
}

/**
 * Full-screen loading while session is being restored (no flash of login on refresh).
 */
export function AuthRouteLoading() {
  return (
    <div className="auth-route-loading" role="status" aria-live="polite">
      <span className="auth-route-loading__dot" />
      <span className="auth-route-loading__text">جاري التحميل…</span>
    </div>
  );
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
    return <Navigate to={getDashboardPath(user.role)} replace />;
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

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={getDashboardPath(user.role)} replace />;
  }

  return children;
}
