import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/core/router/routes.dart';
import 'package:orderzhouse_app/features/notifications/data/notification_models.dart';
import 'package:orderzhouse_app/features/notifications/navigation/notification_action_resolver.dart';

AppNotification _notification({
  String id = '1',
  String? actionUrl,
  String? entityType,
  String? entityId,
  String? recipientRole,
}) {
  return AppNotification(
    id: id,
    title: 'عنوان',
    message: 'رسالة',
    actionUrl: actionUrl,
    entityType: entityType,
    entityId: entityId,
    recipientRole: recipientRole,
  );
}

void main() {
  group('AppNotification recipientRole parsing', () {
    test('reads recipientRole camelCase and snake_case', () {
      final camel = AppNotification.fromJson({
        'id': '1',
        'title': 't',
        'message': 'm',
        'recipientRole': 'client',
      });
      final snake = AppNotification.fromJson({
        'id': '2',
        'title': 't',
        'message': 'm',
        'recipient_role': 'freelancer',
      });

      expect(camel.recipientRole, 'client');
      expect(snake.recipientRole, 'freelancer');
    });
  });

  group('resolveNotificationAction — valid mappings', () {
    test('client my-orders query orderId', () {
      final target = resolveNotificationAction(
        _notification(
          actionUrl: '/dashboard/client/my-orders?orderId=123&paid=1&bidId=9',
          recipientRole: 'client',
        ),
        currentUserRole: 'client',
      );

      expect(target?.route, AppRoutes.clientOrderPath('123'));
      expect(target?.buttonLabel, isNotEmpty);
    });

    test('client order via entity fallback', () {
      final target = resolveNotificationAction(
        _notification(
          entityType: 'order',
          entityId: '123',
          recipientRole: 'client',
        ),
        currentUserRole: 'client',
      );

      expect(target?.route, '/client/orders/123');
    });

    test('client my-orders path uses entityId when query missing', () {
      final target = resolveNotificationAction(
        _notification(
          actionUrl: '/dashboard/client/my-orders',
          entityType: 'order',
          entityId: '55',
          recipientRole: 'client',
        ),
        currentUserRole: 'client',
      );

      expect(target?.route, AppRoutes.clientOrderPath('55'));
    });

    test('freelancer assigned order', () {
      final target = resolveNotificationAction(
        _notification(
          actionUrl: '/dashboard/freelancer/my-orders/456',
          recipientRole: 'freelancer',
        ),
        currentUserRole: 'freelancer',
      );

      expect(target?.route, AppRoutes.freelancerOrderPath('456'));
    });

    test('freelancer pool order', () {
      final target = resolveNotificationAction(
        _notification(
          actionUrl: '/dashboard/freelancer/orders/789',
          recipientRole: 'freelancer',
        ),
        currentUserRole: 'freelancer',
      );

      expect(target?.route, AppRoutes.poolOrderPath('789'));
    });

    test('freelancer financial claims via link', () {
      final target = resolveNotificationAction(
        _notification(
          actionUrl: '/dashboard/freelancer/financial-claims',
          recipientRole: 'freelancer',
        ),
        currentUserRole: 'freelancer',
      );

      expect(target?.route, AppRoutes.freelancerFinancialClaims);
    });

    test('freelancer plans link opens profile (no plans UI)', () {
      final target = resolveNotificationAction(
        _notification(
          actionUrl: '/dashboard/freelancer/plans',
          recipientRole: 'freelancer',
        ),
        currentUserRole: 'freelancer',
      );

      expect(target?.route, AppRoutes.profile);
      expect(target?.buttonLabel, 'فتح حسابي');
    });

    test('financial_claim entity fallback', () {
      final target = resolveNotificationAction(
        _notification(
          entityType: 'financial_claim',
          entityId: '12',
          recipientRole: 'freelancer',
        ),
        currentUserRole: 'freelancer',
      );

      expect(target?.route, AppRoutes.freelancerFinancialClaims);
    });

    test('subscription entity fallback opens profile', () {
      final target = resolveNotificationAction(
        _notification(
          entityType: 'subscription',
          entityId: '3',
          recipientRole: 'freelancer',
        ),
        currentUserRole: 'freelancer',
      );

      expect(target?.route, AppRoutes.profile);
    });

    test('plan entity fallback opens profile', () {
      final target = resolveNotificationAction(
        _notification(
          entityType: 'plan',
          entityId: '1',
          recipientRole: 'freelancer',
        ),
        currentUserRole: 'freelancer',
      );

      expect(target?.route, AppRoutes.profile);
    });
  });

  group('resolveNotificationAction — invalid / rejected', () {
    test('external and dangerous URLs', () {
      const badUrls = [
        'https://evil.com',
        'http://evil.com',
        '//evil.com',
        'javascript:alert(1)',
        '/dashboard/../../../etc',
        '/dashboard/client/my-orders?orderId=%2e%2e%2f1',
      ];

      for (final url in badUrls) {
        expect(
          resolveNotificationAction(
            _notification(actionUrl: url, recipientRole: 'client'),
            currentUserRole: 'client',
          ),
          isNull,
          reason: 'should reject $url',
        );
        expect(isNotificationLinkUnsafe(url), isTrue, reason: url);
      }
    });

    test('non-numeric orderId in query', () {
      expect(
        resolveNotificationAction(
          _notification(
            actionUrl: '/dashboard/client/my-orders?orderId=abc',
            recipientRole: 'client',
          ),
          currentUserRole: 'client',
        ),
        isNull,
      );
    });

    test('non-numeric entityId', () {
      expect(
        resolveNotificationAction(
          _notification(
            entityType: 'order',
            entityId: 'abc',
            recipientRole: 'client',
          ),
          currentUserRole: 'client',
        ),
        isNull,
      );
    });

    test('admin and super-admin links', () {
      expect(
        resolveNotificationAction(
          _notification(actionUrl: '/dashboard/super-admin/financial-claims'),
          currentUserRole: 'freelancer',
        ),
        isNull,
      );
      expect(
        resolveNotificationAction(
          _notification(actionUrl: '/dashboard/admin/orders'),
          currentUserRole: 'client',
        ),
        isNull,
      );
    });

    test('freelancer courses deep link and unsupported profile', () {
      final course = resolveNotificationAction(
        _notification(actionUrl: '/dashboard/freelancer/courses/1'),
        currentUserRole: 'freelancer',
      );
      expect(course, isNotNull);
      expect(course!.route, AppRoutes.courseDetailsPath('1'));
      expect(course.buttonLabel, 'فتح الدورة');

      final coursesList = resolveNotificationAction(
        _notification(actionUrl: '/dashboard/freelancer/courses'),
        currentUserRole: 'freelancer',
      );
      expect(coursesList, isNotNull);
      expect(coursesList!.route, AppRoutes.courses);

      expect(
        resolveNotificationAction(
          _notification(actionUrl: '/dashboard/freelancer/profile'),
          currentUserRole: 'freelancer',
        ),
        isNull,
      );
    });

    test('generic dashboard root', () {
      expect(
        resolveNotificationAction(
          _notification(actionUrl: '/dashboard'),
          currentUserRole: 'client',
        ),
        isNull,
      );
    });

    test('unknown dashboard path', () {
      expect(
        resolveNotificationAction(
          _notification(actionUrl: '/dashboard/unknown/path'),
          currentUserRole: 'client',
        ),
        isNull,
      );
    });

    test('role mismatch recipient freelancer vs current client', () {
      expect(
        resolveNotificationAction(
          _notification(
            actionUrl: '/dashboard/freelancer/orders/1',
            recipientRole: 'freelancer',
          ),
          currentUserRole: 'client',
        ),
        isNull,
      );
    });

    test('role mismatch recipient client vs current freelancer', () {
      expect(
        resolveNotificationAction(
          _notification(
            actionUrl: '/dashboard/client/my-orders?orderId=1',
            recipientRole: 'client',
          ),
          currentUserRole: 'freelancer',
        ),
        isNull,
      );
    });

    test('admin recipient role always rejected', () {
      expect(
        resolveNotificationAction(
          _notification(
            actionUrl: '/dashboard/freelancer/plans',
            recipientRole: 'admin',
          ),
          currentUserRole: 'freelancer',
        ),
        isNull,
      );
    });

    test('freelancer order entity without link does not guess route', () {
      expect(
        resolveNotificationAction(
          _notification(
            entityType: 'order',
            entityId: '99',
            recipientRole: 'freelancer',
          ),
          currentUserRole: 'freelancer',
        ),
        isNull,
      );
    });

    test('resolver never returns raw actionUrl as route', () {
      const webLink = '/dashboard/client/my-orders?orderId=123';
      final target = resolveNotificationAction(
        _notification(actionUrl: webLink, recipientRole: 'client'),
        currentUserRole: 'client',
      );
      expect(target?.route, isNot(webLink));
      expect(target?.route, startsWith('/client/orders/'));
    });
  });
}
