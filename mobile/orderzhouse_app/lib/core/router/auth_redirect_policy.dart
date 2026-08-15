import 'routes.dart';

/// Auth routes and splash — no login redirect.
bool isUnauthenticatedAllowedRoute(String location) {
  if (location == AppRoutes.login ||
      location == AppRoutes.register ||
      location.startsWith(AppRoutes.otp) ||
      location.startsWith(AppRoutes.forgotPassword) ||
      location == AppRoutes.splash) {
    return true;
  }
  // Payment return stays reachable; screen itself requires login to confirm.
  if (location.startsWith(AppRoutes.paymentReturn)) {
    return true;
  }
  // Legal/public content only — not a guest browsing shell.
  if (location.startsWith('/public/')) {
    return true;
  }
  return false;
}

/// Whether an unauthenticated user should be sent to login for [location].
/// Auth-first: everything except auth / splash / payment return / public legal.
bool shouldRedirectUnauthenticatedToLogin(String location) {
  return !isUnauthenticatedAllowedRoute(location);
}

bool isPublicPaymentReturnRoute(String location) =>
    location.startsWith(AppRoutes.paymentReturn);

/// Safe in-app redirect target after login (relative paths only).
/// Rejects auth/splash loops and external URLs.
String? sanitizeLoginRedirect(String? raw) {
  if (raw == null || raw.trim().isEmpty) return null;
  final decoded = Uri.decodeComponent(raw.trim());
  if (!decoded.startsWith('/')) return null;
  if (decoded.startsWith('//')) return null;

  final path = Uri.tryParse(decoded)?.path ?? decoded;
  if (path == AppRoutes.login ||
      path == AppRoutes.register ||
      path.startsWith(AppRoutes.otp) ||
      path.startsWith(AppRoutes.forgotPassword) ||
      path == AppRoutes.splash) {
    return null;
  }
  return decoded;
}

/// Freelancer pantry hub or request detail (not other `/freelancer/...` routes).
bool isFreelancerPantryLocation(String location) {
  final path = Uri.tryParse(location)?.path ?? location;
  return path == AppRoutes.freelancerPantry ||
      path.startsWith('${AppRoutes.freelancerPantry}/');
}
