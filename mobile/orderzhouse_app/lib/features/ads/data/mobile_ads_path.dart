import '../../auth/domain/auth_user.dart';
import '../../../core/router/routes.dart';

/// Maps Flutter go_router locations to web-equivalent pathnames so backend
/// `pageScope` (home / public / dashboard) filters work like the website.
class MobileAdsPath {
  const MobileAdsPath._();

  static String normalize(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return '/';
    final path = trimmed.startsWith('/') ? trimmed : '/$trimmed';
    final q = path.indexOf('?');
    return q >= 0 ? path.substring(0, q) : path;
  }

  /// Web pathname for popup/banner page-scope filtering.
  static String webPathnameForLocation(String location, {AuthUser? user}) {
    final path = normalize(location);
    final role = user?.effectiveRole ?? '';

    if (path == AppRoutes.shell || path == AppRoutes.home || path == '/') {
      // Auth-first app: treat main tab as role dashboard so pageScope=dashboard +
      // audience filters match the website admin configuration.
      if (role == 'freelancer') return '/dashboard/freelancer';
      if (role == 'client') return '/dashboard/client';
      return '/dashboard/client';
    }

    if (path == AppRoutes.services) return '/services';
    if (path == AppRoutes.courses || path.startsWith('/courses/')) {
      return path == AppRoutes.courses
          ? '/dashboard/freelancer/courses'
          : path.replaceFirst('/courses/', '/dashboard/freelancer/courses/');
    }
    if (path == AppRoutes.marketplace) return '/orders';

    if (path == AppRoutes.myOrders) {
      return role == 'freelancer' ? '/dashboard/freelancer/my-orders' : '/dashboard/client/orders';
    }

    if (path == AppRoutes.profile) {
      return role == 'freelancer' ? '/dashboard/freelancer' : '/dashboard/client';
    }

    if (path.startsWith('/client/orders/create')) {
      return '/dashboard/client/orders/create';
    }
    if (path.startsWith('/client/orders/')) {
      return '/dashboard/client/orders';
    }
    if (path.startsWith('/freelancer/my-orders')) {
      return '/dashboard/freelancer/my-orders';
    }
    if (path.startsWith('/freelancer/financial-claims')) {
      return '/dashboard/freelancer/financial-claims';
    }
    if (path.startsWith('/freelancer/account-activation')) {
      return '/dashboard/freelancer/activate-account';
    }
    if (path.startsWith('/freelancer/plans')) {
      return '/dashboard/freelancer/plans';
    }
    if (path.startsWith('/orders/pool/')) {
      return '/orders';
    }
    if (path.startsWith('/notifications')) {
      return role == 'freelancer' ? '/dashboard/freelancer' : '/dashboard/client';
    }
    if (path.startsWith('/public/')) {
      return path.replaceFirst('/public/', '/');
    }
    if (path.startsWith('/payment/')) {
      return path;
    }
    if (path == AppRoutes.login || path.startsWith('/login')) return '/login';
    if (path.startsWith('/register')) return '/register';
    if (path.startsWith('/otp')) return '/login';

    return path;
  }

  static bool isPopupRouteBlocked(String location, {String search = ''}) {
    final path = normalize(location);
    final web = webPathnameForLocation(path);
    final q = search.isNotEmpty
        ? search
        : (location.contains('?') ? location.substring(location.indexOf('?')) : '');

    if (_blockedExact.contains(path) || _blockedExact.contains(web)) return true;
    if (path == AppRoutes.login || path.startsWith('/login')) return true;
    if (path.startsWith('/register') || path.startsWith('/otp') || path.startsWith('/splash')) {
      return true;
    }
    if (path.startsWith(AppRoutes.clientCreateOrder) || web.startsWith('/dashboard/client/orders/create')) {
      return true;
    }
    if (path.startsWith(AppRoutes.freelancerFinancialClaims) ||
        web.startsWith('/dashboard/freelancer/financial-claims')) {
      return true;
    }
    if (path.startsWith(AppRoutes.freelancerMiniArticles) ||
        web.startsWith('/dashboard/freelancer/articles')) {
      return true;
    }
    if (path.startsWith(AppRoutes.freelancerPlans) || web.startsWith('/dashboard/freelancer/plans')) {
      return true;
    }
    if (path.startsWith(AppRoutes.paymentReturn) || web.startsWith('/payment')) return true;

    for (final prefix in _blockedWebPrefixes) {
      if (web == prefix || web.startsWith('$prefix/')) return true;
    }

    if (web.startsWith('/dashboard/') &&
        (web.endsWith('/settings') || web.contains('/settings/'))) {
      return true;
    }

    return _hasPaymentReturnQuery(q);
  }

  static bool _hasPaymentReturnQuery(String search) {
    final q = Uri.splitQueryString(search.replaceFirst(RegExp(r'^\?'), ''));
    if ((q['session_id'] ?? '').trim().isNotEmpty) return true;
    if ((q['payment_intent'] ?? '').trim().isNotEmpty) return true;
    if ((q['payment_intent_client_secret'] ?? '').trim().isNotEmpty) return true;
    final checkout = q['checkout'];
    return checkout == 'success' || checkout == 'cancel';
  }

  static const _blockedExact = {
    '/login',
    '/register',
    '/forgot-password',
    '/unauthorized',
  };

  static const _blockedWebPrefixes = [
    '/dashboard/admin/ads',
    '/dashboard/super-admin/ads',
    '/dashboard/client/financial',
    '/dashboard/client/orders/create',
    '/dashboard/freelancer/plans',
    '/dashboard/freelancer/financial-claims',
    '/dashboard/super-admin/financial-claims',
  ];
}
