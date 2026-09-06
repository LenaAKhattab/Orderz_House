import 'routes.dart';

/// Super Admin Phase 1A exclusive Flutter routes (not web dashboard URLs).
bool isSuperAdminExclusiveLocation(String location) {
  final path = Uri.tryParse(location)?.path ?? location;
  return path == '/super-admin' || path.startsWith('/super-admin/');
}

/// Canonical targets for Super Admin path aliases used in QA / deep links.
/// Returns null when [location] is already a primary Flutter route.
String? superAdminPathAlias(String location) {
  final path = Uri.tryParse(location)?.path ?? location;
  switch (path) {
    case '/super-admin':
    case '/super-admin/':
      return AppRoutes.home;
    case '/super-admin/notifications':
      return AppRoutes.notifications;
    case '/super-admin/account':
      return AppRoutes.accountSettings;
    case '/super-admin/financial-claims':
      return AppRoutes.superAdminClaims;
    default:
      return null;
  }
}

/// Client/freelancer-only surfaces Super Admin must not land on.
bool isClientFreelancerOnlyLocation(String location) {
  final path = Uri.tryParse(location)?.path ?? location;
  if (path == AppRoutes.marketplace || path.startsWith('${AppRoutes.marketplace}/')) {
    return true;
  }
  if (path == AppRoutes.myOrders || path.startsWith('${AppRoutes.myOrders}/')) {
    return true;
  }
  if (path == AppRoutes.courses || path.startsWith('/courses/')) {
    return true;
  }
  if (path.startsWith('/client/')) return true;
  if (path.startsWith('/freelancer/')) return true;
  if (path.startsWith('/orders/pool/')) return true;
  return false;
}

/// Redirect when the current role must not stay on [location].
/// Returns null when no redirect is needed.
String? superAdminRoleRedirect({
  required String location,
  required String? effectiveRole,
}) {
  final role = (effectiveRole ?? '').trim().toLowerCase();
  final isSuperAdmin = role == 'super_admin' || role == 'super-admin';

  if (!isSuperAdmin && isSuperAdminExclusiveLocation(location)) {
    return AppRoutes.home;
  }
  if (isSuperAdmin && isClientFreelancerOnlyLocation(location)) {
    return AppRoutes.home;
  }
  return null;
}

bool shouldShowPopupAdsForRole(String? effectiveRole) {
  final role = (effectiveRole ?? '').trim().toLowerCase();
  return role != 'super_admin' && role != 'super-admin';
}
