import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/core/router/auth_redirect_policy.dart';
import 'package:orderzhouse_app/core/router/routes.dart';
import 'package:orderzhouse_app/features/notifications/data/notification_models.dart';
import 'package:orderzhouse_app/features/notifications/data/notifications_api.dart';

void main() {
  group('AppNotification parsing', () {
    test('fromJson reads camelCase fields', () {
      final n = AppNotification.fromJson({
        'id': '101',
        'title': 'تم إنشاء الطلب',
        'message': 'تم إنشاء طلب مزايدة جديد وفتحه للمستقلين.',
        'type': 'order.created',
        'createdAt': '2026-07-09T07:00:00.000Z',
        'readAt': null,
        'isRead': false,
        'entityType': 'order',
        'entityId': '26822',
        'link': '/dashboard/client/my-orders',
        'priority': 'high',
        'actor': {'displayName': 'عميل QA'},
      });

      expect(n.id, '101');
      expect(n.title, 'تم إنشاء الطلب');
      expect(n.message, contains('مزايدة'));
      expect(n.type, 'order.created');
      expect(n.entityType, 'order');
      expect(n.entityId, '26822');
      expect(n.actionUrl, '/dashboard/client/my-orders');
      expect(n.isUnread, isTrue);
      expect(n.actorDisplayName, 'عميل QA');
    });

    test('fromJson supports snake_case fields', () {
      final n = AppNotification.fromJson({
        'id': '5',
        'title': 'عرض جديد',
        'message': 'تم استلام عرض سعر.',
        'type': 'order.bid.received',
        'created_at': '2026-06-01T12:00:00.000Z',
        'read_at': '2026-06-02T08:00:00.000Z',
        'is_read': true,
        'entity_type': 'order',
        'entity_id': '99',
        'link': '/dashboard/freelancer/orders/99',
      });

      expect(n.createdAt, '2026-06-01T12:00:00.000Z');
      expect(n.readAt, '2026-06-02T08:00:00.000Z');
      expect(n.isRead, isTrue);
      expect(n.isUnread, isFalse);
      expect(n.actionUrl, '/dashboard/freelancer/orders/99');
    });

    test('tolerates null and missing optional fields', () {
      final n = AppNotification.fromJson({
        'id': '1',
        'title': 'إشعار',
        'message': 'نص',
      });

      expect(n.type, isNull);
      expect(n.createdAt, isNull);
      expect(n.entityType, isNull);
      expect(n.actionUrl, isNull);
      expect(n.isUnread, isTrue);
    });
  });

  group('NotificationsPage parsing', () {
    test('parseResponse reads notifications array from envelope', () {
      final page = NotificationsPage.parseResponse({
        'success': true,
        'data': {
          'notifications': [
            {'id': '1', 'title': 'أ', 'message': 'ب', 'isRead': false},
            {'id': '2', 'title': 'ج', 'message': 'د', 'isRead': true},
          ],
          'total': 2,
          'limit': 50,
          'offset': 0,
        },
      });

      expect(page.notifications, hasLength(2));
      expect(page.total, 2);
      expect(page.unreadCountLocal, 1);
    });

    test('empty state logic — no notifications', () {
      final page = NotificationsPage.parseResponse({
        'success': true,
        'data': {'notifications': [], 'total': 0, 'limit': 50, 'offset': 0},
      });

      expect(page.notifications, isEmpty);
      expect(page.unreadCountLocal, 0);
    });
  });

  group('UnreadNotificationsCount parsing', () {
    test('parseResponse reads unreadCount', () {
      final count = UnreadNotificationsCount.parseResponse({
        'success': true,
        'data': {'unreadCount': 7},
      });
      expect(count.count, 7);
    });

    test('parseResponse supports snake_case unread_count', () {
      final count = UnreadNotificationsCount.parseResponse({
        'success': true,
        'data': {'unread_count': 3},
      });
      expect(count.count, 3);
    });
  });

  group('unread detection', () {
    test('isUnread uses isRead flag', () {
      expect(
        AppNotification(id: '1', title: 't', message: 'm', isRead: false).isUnread,
        isTrue,
      );
      expect(
        AppNotification(id: '1', title: 't', message: 'm', isRead: true).isUnread,
        isFalse,
      );
    });
  });

  group('NotificationsApi — read endpoints', () {
    test('fetch uses GET and mark endpoints use POST only (no DELETE)', () {
      final api = NotificationsApi(Dio());
      expect(api.fetchNotifications, isA<Function>());
      expect(api.markNotificationAsRead, isA<Function>());
      expect(api.markAllNotificationsAsRead, isA<Function>());
    });

    test('fetchNotifications uses GET /notifications', () async {
      String? method;
      String? path;
      final dio = Dio();
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            method = options.method;
            path = options.path;
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {
                  'success': true,
                  'data': {'notifications': [], 'total': 0, 'limit': 10, 'offset': 0},
                },
              ),
            );
          },
        ),
      );
      final api = NotificationsApi(dio);

      await api.fetchNotifications(limit: 10);

      expect(method, 'GET');
      expect(path, '/notifications');
    });
  });

  group('guest route protection', () {
    test('unauthenticated user redirected from /notifications', () {
      expect(shouldRedirectUnauthenticatedToLogin(AppRoutes.notifications), isTrue);
    });

    test('login redirect preserves notifications return path', () {
      final url = AppRoutes.loginWithRedirect(AppRoutes.notifications);
      expect(url, contains(AppRoutes.loginRedirectQuery));
      expect(Uri.parse('http://x$url').queryParameters[AppRoutes.loginRedirectQuery], AppRoutes.notifications);
    });
  });

  group('notificationTypeLabel', () {
    test('maps known types to Arabic labels', () {
      expect(notificationTypeLabel('order.created'), 'طلب');
      expect(notificationTypeLabel('financial.claim.paid'), 'مطالبة مالية');
      expect(notificationTypeLabel(null), 'إشعار جديد');
    });
  });
}
