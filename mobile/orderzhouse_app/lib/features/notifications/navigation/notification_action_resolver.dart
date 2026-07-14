import '../../../core/router/routes.dart';
import '../data/notification_models.dart';

/// Safe in-app navigation target resolved from a notification (no web URLs).
class NotificationActionTarget {
  const NotificationActionTarget({
    required this.route,
    required this.buttonLabel,
  });

  final String route;
  final String buttonLabel;
}

final RegExp _numericIdPattern = RegExp(r'^\d+$');

/// Resolves a notification to a safe Flutter route, or null when unsafe/unknown.
NotificationActionTarget? resolveNotificationAction(
  AppNotification notification, {
  String? currentUserRole,
}) {
  if (_hasRecipientRoleMismatch(notification.recipientRole, currentUserRole)) {
    return null;
  }

  final role = _normalizeRole(currentUserRole);
  if (role == null) return null;

  final link = notification.actionUrl?.trim();
  if (link != null && link.isNotEmpty) {
    if (isNotificationLinkUnsafe(link)) return null;
    final fromLink = _resolveFromDashboardLink(link, role, notification);
    if (fromLink != null) return fromLink;
    return null;
  }

  return _resolveFromEntity(notification, role);
}

/// Returns true when [raw] must be rejected before any route mapping.
bool isNotificationLinkUnsafe(String raw) {
  final link = raw.trim();
  if (link.isEmpty) return false;

  final lower = link.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) return true;
  if (link.startsWith('//')) return true;
  if (lower.startsWith('javascript:')) return true;
  if (link.contains('..') || lower.contains('%2e%2e')) return true;

  try {
    if (Uri.decodeComponent(link).toLowerCase().contains('..')) return true;
  } catch (_) {
    return true;
  }

  if (!link.startsWith('/')) return true;

  if (_isBlockedDashboardPath(link)) return true;

  return false;
}

bool _isBlockedDashboardPath(String link) {
  final path = Uri.parse(link).path;
  final normalized = path.endsWith('/') && path.length > 1 ? path.substring(0, path.length - 1) : path;

  if (normalized == '/dashboard') return true;
  if (normalized.startsWith('/dashboard/admin')) return true;
  if (normalized.startsWith('/dashboard/super-admin')) return true;
  if (normalized == '/dashboard/freelancer/profile' ||
      normalized.startsWith('/dashboard/freelancer/profile/')) {
    return true;
  }

  return false;
}

NotificationActionTarget? _resolveFromDashboardLink(
  String link,
  String role,
  AppNotification notification,
) {
  final uri = Uri.parse(link);
  final path = uri.path;

  if (path == '/dashboard/freelancer/financial-claims') {
    if (role != 'freelancer') return null;
    return const NotificationActionTarget(
      route: AppRoutes.freelancerFinancialClaims,
      buttonLabel: 'فتح المطالبات المالية',
    );
  }

  if (path == '/dashboard/freelancer/plans') {
    // Phase 5K: no in-app plans screen — open profile instead of subscription UI.
    if (role != 'freelancer') return null;
    return const NotificationActionTarget(
      route: AppRoutes.profile,
      buttonLabel: 'فتح حسابي',
    );
  }

  if (path == '/dashboard/freelancer/courses') {
    if (role != 'freelancer') return null;
    return const NotificationActionTarget(
      route: AppRoutes.courses,
      buttonLabel: 'فتح الدورات',
    );
  }

  final courseMatch = RegExp(r'^/dashboard/freelancer/courses/(\d+)$').firstMatch(path);
  if (courseMatch != null) {
    if (role != 'freelancer') return null;
    final id = courseMatch.group(1)!;
    return NotificationActionTarget(
      route: AppRoutes.courseDetailsPath(id),
      buttonLabel: 'فتح الدورة',
    );
  }

  final assignedMatch = RegExp(r'^/dashboard/freelancer/my-orders/(\d+)$').firstMatch(path);
  if (assignedMatch != null) {
    if (role != 'freelancer') return null;
    final id = assignedMatch.group(1)!;
    return NotificationActionTarget(
      route: AppRoutes.freelancerOrderPath(id),
      buttonLabel: 'فتح طلبي',
    );
  }

  final poolMatch = RegExp(r'^/dashboard/freelancer/orders/(\d+)$').firstMatch(path);
  if (poolMatch != null) {
    if (role != 'freelancer') return null;
    final id = poolMatch.group(1)!;
    return NotificationActionTarget(
      route: AppRoutes.poolOrderPath(id),
      buttonLabel: 'فتح في السوق',
    );
  }

  if (path == '/dashboard/client/my-orders') {
    if (role != 'client') return null;
    final orderId = _extractOrderIdFromQuery(uri) ?? _numericIdOrNull(notification.entityId);
    if (orderId == null) return null;
    return NotificationActionTarget(
      route: AppRoutes.clientOrderPath(orderId),
      buttonLabel: 'فتح الطلب',
    );
  }

  return null;
}

NotificationActionTarget? _resolveFromEntity(AppNotification notification, String role) {
  final entityType = notification.entityType?.trim().toLowerCase();

  if (entityType == 'financial_claim') {
    if (role != 'freelancer') return null;
    return const NotificationActionTarget(
      route: AppRoutes.freelancerFinancialClaims,
      buttonLabel: 'فتح المطالبات المالية',
    );
  }

  if (entityType == 'subscription' || entityType == 'plan') {
    // Phase 5K: do not deep-link into removed plans UI.
    if (role != 'freelancer') return null;
    return const NotificationActionTarget(
      route: AppRoutes.profile,
      buttonLabel: 'فتح حسابي',
    );
  }

  if (entityType == 'order') {
    final orderId = _numericIdOrNull(notification.entityId);
    if (orderId == null) return null;

    final recipient = _normalizeRole(notification.recipientRole);
    if (recipient == 'client') {
      if (role != 'client') return null;
      return NotificationActionTarget(
        route: AppRoutes.clientOrderPath(orderId),
        buttonLabel: 'فتح الطلب',
      );
    }

    if (recipient == 'freelancer') {
      if (role != 'freelancer') return null;
      return null;
    }

    if (role == 'client') {
      return NotificationActionTarget(
        route: AppRoutes.clientOrderPath(orderId),
        buttonLabel: 'فتح الطلب',
      );
    }
  }

  return null;
}

String? _extractOrderIdFromQuery(Uri uri) {
  final raw = uri.queryParameters['orderId'] ?? uri.queryParameters['orderid'];
  return _numericIdOrNull(raw);
}

String? _numericIdOrNull(String? raw) {
  final value = raw?.trim();
  if (value == null || value.isEmpty) return null;
  if (!_numericIdPattern.hasMatch(value)) return null;
  return value;
}

String? _normalizeRole(String? role) {
  final normalized = role?.trim().toLowerCase();
  if (normalized == null || normalized.isEmpty) return null;
  if (normalized == 'super-admin') return 'super_admin';
  return normalized;
}

bool _hasRecipientRoleMismatch(String? recipientRole, String? currentUserRole) {
  final recipient = _normalizeRole(recipientRole);
  final current = _normalizeRole(currentUserRole);

  if (recipient == null) return false;

  if (recipient == 'admin' || recipient == 'super_admin') return true;

  if (current == null) return true;

  return recipient != current;
}
