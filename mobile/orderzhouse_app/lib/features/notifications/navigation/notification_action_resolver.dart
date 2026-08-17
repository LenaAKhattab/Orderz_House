import '../../../core/router/routes.dart';
import '../data/notification_models.dart';

/// Safe in-app navigation target resolved from a notification (no web URLs).
class NotificationActionTarget {
  const NotificationActionTarget({
    required this.route,
    required this.buttonLabel,
    this.showComingSoonMessage = false,
  });

  final String route;
  final String buttonLabel;
  final bool showComingSoonMessage;
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

  if (role == 'super_admin') {
    return _resolveSuperAdminDashboardLink(path);
  }

  if (_looksLikePantry(path, notification)) {
    if (role != 'freelancer') return null;
    final requestId = _extractPantryRequestId(path, uri, notification);
    if (requestId != null) {
      return NotificationActionTarget(
        route: AppRoutes.freelancerPantryDetail(requestId),
        buttonLabel: 'فتح الطلب',
      );
    }
    return const NotificationActionTarget(
      route: AppRoutes.marketplace,
      buttonLabel: 'فتح الطلبات المتاحة',
    );
  }

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
  final type = notification.type?.trim().toLowerCase() ?? '';

  if (role == 'super_admin') {
    if (entityType == 'financial_claim' || type.startsWith('financial_claim')) {
      return const NotificationActionTarget(
        route: AppRoutes.superAdminClaims,
        buttonLabel: 'فتح المطالبات',
      );
    }
    if (entityType == 'pantry_delivery' || type.contains('pantry_delivery') || type.contains('pantry_revision')) {
      final id = _numericIdOrNull(notification.entityId);
      if (id != null) {
        return NotificationActionTarget(
          route: AppRoutes.superAdminPantryDeliveryPath(id),
          buttonLabel: 'فتح التسليم',
        );
      }
      return const NotificationActionTarget(
        route: AppRoutes.superAdminPantry,
        buttonLabel: 'فتح بيت المونة',
      );
    }
    if (entityType == 'pantry_request' || type.contains('pantry')) {
      final id = _numericIdOrNull(notification.entityId);
      if (id != null) {
        return NotificationActionTarget(
          route: AppRoutes.superAdminPantryRequestPath(id),
          buttonLabel: 'فتح طلب بيت المونة',
        );
      }
      return const NotificationActionTarget(
        route: AppRoutes.superAdminPantry,
        buttonLabel: 'فتح بيت المونة',
      );
    }
    if (entityType == 'subscription' ||
        type.contains('activation') ||
        type.startsWith('subscription')) {
      return const NotificationActionTarget(
        route: AppRoutes.superAdminActivation,
        buttonLabel: 'فتح طلبات التفعيل',
      );
    }
    if (entityType == 'marketplace_article' ||
        entityType == 'marketplace_article_application' ||
        type.contains('article')) {
      if (entityType == 'marketplace_article') {
        final id = _numericIdOrNull(notification.entityId);
        if (id != null) {
          return NotificationActionTarget(
            route: AppRoutes.superAdminArticlePath(id),
            buttonLabel: 'فتح المقال',
          );
        }
      }
      return const NotificationActionTarget(
        route: AppRoutes.superAdminArticles,
        buttonLabel: 'فتح المقالات',
      );
    }
    return const NotificationActionTarget(
      route: AppRoutes.home,
      buttonLabel: 'فتح مركز المهام',
      showComingSoonMessage: true,
    );
  }

  if (entityType == 'pantry_request' ||
      entityType == 'pantry_delivery' ||
      type.contains('pantry')) {
    if (role != 'freelancer') return null;
    if (entityType == 'pantry_request') {
      final id = _numericIdOrNull(notification.entityId);
      if (id != null) {
        return NotificationActionTarget(
          route: AppRoutes.freelancerPantryDetail(id),
          buttonLabel: 'فتح الطلب',
        );
      }
    }
    return const NotificationActionTarget(
      route: AppRoutes.marketplace,
      buttonLabel: 'فتح الطلبات المتاحة',
    );
  }

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

String? _extractPantryRequestId(String path, Uri uri, AppNotification notification) {
  final fromQuery = _numericIdOrNull(
    uri.queryParameters['requestId'] ??
        uri.queryParameters['pantryRequestId'] ??
        uri.queryParameters['id'],
  );
  if (fromQuery != null) return fromQuery;

  final match = RegExp(r'/pantry/(?:requests/)?(\d+)(?:/|$)').firstMatch(path);
  if (match != null) return match.group(1);

  final entityType = notification.entityType?.trim().toLowerCase();
  if (entityType == 'pantry_request') {
    return _numericIdOrNull(notification.entityId);
  }
  return null;
}

bool _looksLikePantry(String path, AppNotification notification) {
  final haystack = [
    path.toLowerCase(),
    (notification.actionUrl ?? '').toLowerCase(),
    (notification.entityType ?? '').toLowerCase(),
    (notification.type ?? '').toLowerCase(),
  ].join(' ');
  return haystack.contains('pantry') ||
      haystack.contains('pantry_request') ||
      haystack.contains('pantry_delivery') ||
      haystack.contains('/freelancer/pantry');
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

  if (recipient == 'admin' || recipient == 'super_admin') {
    return current != 'super_admin';
  }

  if (current == null) return true;

  return recipient != current;
}

NotificationActionTarget? _resolveSuperAdminDashboardLink(String path) {
  var normalized = path;
  if (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.substring(0, normalized.length - 1);
  }

  if (normalized == '/dashboard/super-admin' ||
      normalized == '/dashboard/super-admin/notifications') {
    return NotificationActionTarget(
      route: normalized.endsWith('/notifications') ? AppRoutes.notifications : AppRoutes.home,
      buttonLabel: normalized.endsWith('/notifications') ? 'فتح الإشعارات' : 'فتح مركز المهام',
    );
  }

  if (normalized == '/dashboard/super-admin/subscriptions/activation' ||
      normalized.startsWith('/dashboard/super-admin/subscriptions/activation/')) {
    return const NotificationActionTarget(
      route: AppRoutes.superAdminActivation,
      buttonLabel: 'فتح طلبات التفعيل',
    );
  }

  if (normalized == '/dashboard/super-admin/financial-claims' ||
      normalized.startsWith('/dashboard/super-admin/financial-claims/')) {
    return const NotificationActionTarget(
      route: AppRoutes.superAdminClaims,
      buttonLabel: 'فتح المطالبات',
    );
  }

  if (normalized == '/dashboard/super-admin/pantry') {
    return const NotificationActionTarget(
      route: AppRoutes.superAdminPantry,
      buttonLabel: 'فتح بيت المونة',
    );
  }

  if (normalized.startsWith('/dashboard/super-admin/pantry/')) {
    final rest = normalized.substring('/dashboard/super-admin/pantry/'.length);
    final deliveryMatch = RegExp(r'^deliveries/([^/]+)$').firstMatch(rest);
    if (deliveryMatch != null) {
      return NotificationActionTarget(
        route: AppRoutes.superAdminPantryDeliveryPath(deliveryMatch.group(1)!),
        buttonLabel: 'فتح التسليم',
      );
    }
    final requestMatch = RegExp(r'^(?:requests/)?(\d+)$').firstMatch(rest);
    if (requestMatch != null) {
      return NotificationActionTarget(
        route: AppRoutes.superAdminPantryRequestPath(requestMatch.group(1)!),
        buttonLabel: 'فتح طلب بيت المونة',
      );
    }
    return const NotificationActionTarget(
      route: AppRoutes.home,
      buttonLabel: 'فتح مركز المهام',
      showComingSoonMessage: true,
    );
  }

  if (normalized == '/dashboard/super-admin/marketplace-articles') {
    return const NotificationActionTarget(
      route: AppRoutes.superAdminArticles,
      buttonLabel: 'فتح المقالات',
    );
  }

  if (normalized.startsWith('/dashboard/super-admin/marketplace-articles/')) {
    final rest = normalized.substring('/dashboard/super-admin/marketplace-articles/'.length);
    final idMatch = RegExp(r'^(\d+)(?:/applications)?$').firstMatch(rest);
    if (idMatch != null) {
      return NotificationActionTarget(
        route: AppRoutes.superAdminArticlePath(idMatch.group(1)!),
        buttonLabel: 'فتح المقال',
      );
    }
    return const NotificationActionTarget(
      route: AppRoutes.home,
      buttonLabel: 'فتح مركز المهام',
      showComingSoonMessage: true,
    );
  }

  if (normalized == '/dashboard/super-admin/settings') {
    return const NotificationActionTarget(
      route: AppRoutes.accountSettings,
      buttonLabel: 'فتح إعدادات الحساب',
    );
  }

  if (normalized.startsWith('/dashboard/super-admin')) {
    return const NotificationActionTarget(
      route: AppRoutes.home,
      buttonLabel: 'فتح مركز المهام',
      showComingSoonMessage: true,
    );
  }

  return const NotificationActionTarget(
    route: AppRoutes.home,
    buttonLabel: 'فتح مركز المهام',
    showComingSoonMessage: true,
  );
}
