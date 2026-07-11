import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/core/router/routes.dart';
import 'package:orderzhouse_app/features/notifications/data/notification_models.dart';
import 'package:orderzhouse_app/features/notifications/presentation/notification_open_action.dart';

AppNotification _notification({
  String? actionUrl,
  String? entityType,
  String? entityId,
  String? recipientRole,
}) {
  return AppNotification(
    id: '1',
    title: 'عنوان',
    message: 'رسالة',
    actionUrl: actionUrl,
    entityType: entityType,
    entityId: entityId,
    recipientRole: recipientRole,
  );
}

void main() {
  group('notificationOpenActionTarget — open button visibility', () {
    test('safe client order notification exposes open target', () {
      final target = notificationOpenActionTarget(
        notification: _notification(
          actionUrl: '/dashboard/client/my-orders?orderId=123',
          recipientRole: 'client',
        ),
        currentUserRole: 'client',
      );

      expect(target, isNotNull);
      expect(target!.route, AppRoutes.clientOrderPath('123'));
      expect(target.buttonLabel, isNotEmpty);
      expect(target.route, isNot(contains('dashboard')));
    });

    test('external actionUrl does not expose open target', () {
      final target = notificationOpenActionTarget(
        notification: _notification(
          actionUrl: 'https://evil.com',
          recipientRole: 'client',
        ),
        currentUserRole: 'client',
      );

      expect(target, isNull);
    });

    test('role mismatch does not expose open target', () {
      final target = notificationOpenActionTarget(
        notification: _notification(
          actionUrl: '/dashboard/freelancer/orders/9',
          recipientRole: 'freelancer',
        ),
        currentUserRole: 'client',
      );

      expect(target, isNull);
    });

    test('open target route never equals raw actionUrl', () {
      const webLink = '/dashboard/client/my-orders?orderId=55';
      final target = notificationOpenActionTarget(
        notification: _notification(actionUrl: webLink, recipientRole: 'client'),
        currentUserRole: 'client',
      );

      expect(target?.route, isNot(webLink));
      expect(target?.route, AppRoutes.clientOrderPath('55'));
    });

    test('freelancer financial claims exposes open target', () {
      final target = notificationOpenActionTarget(
        notification: _notification(
          entityType: 'financial_claim',
          entityId: '8',
          recipientRole: 'freelancer',
        ),
        currentUserRole: 'freelancer',
      );

      expect(target?.route, AppRoutes.freelancerFinancialClaims);
    });
  });
}
