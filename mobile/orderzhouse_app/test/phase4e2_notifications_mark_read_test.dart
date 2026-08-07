import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/features/notifications/data/notification_models.dart';
import 'package:orderzhouse_app/features/notifications/data/notifications_api.dart';
import 'package:orderzhouse_app/features/notifications/data/notifications_repository.dart';
import 'package:orderzhouse_app/features/notifications/presentation/notifications_mark_read_controller.dart';

void main() {
  group('Mark-as-read API', () {
    test('markNotificationAsRead uses POST /notifications/:id/read without body', () async {
      String? method;
      String? path;
      dynamic postData;
      final dio = Dio();
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            method = options.method;
            path = options.path;
            postData = options.data;
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {
                  'success': true,
                  'data': {
                    'notification': {
                      'id': '42',
                      'title': 'تم',
                      'message': 'نص',
                      'isRead': true,
                    },
                  },
                },
              ),
            );
          },
        ),
      );
      final api = NotificationsApi(dio);

      final updated = await api.markNotificationAsRead('42');

      expect(method, 'POST');
      expect(path, '/notifications/42/read');
      expect(postData, isNull);
      expect(updated.id, '42');
      expect(updated.isRead, isTrue);
      expect(updated.isUnread, isFalse);
    });

    test('markAllNotificationsAsRead uses POST /notifications/read-all without body', () async {
      String? method;
      String? path;
      dynamic postData;
      final dio = Dio();
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            method = options.method;
            path = options.path;
            postData = options.data;
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {
                  'success': true,
                  'data': {'updatedCount': 5},
                },
              ),
            );
          },
        ),
      );
      final api = NotificationsApi(dio);

      final result = await api.markAllNotificationsAsRead();

      expect(method, 'POST');
      expect(path, '/notifications/read-all');
      expect(postData, isNull);
      expect(result.updatedCount, 5);
    });

    test('API does not use DELETE or send userId/recipientId', () {
      expect(NotificationsApi(Dio()).markNotificationAsRead, isA<Function>());
      expect(NotificationsApi(Dio()).markAllNotificationsAsRead, isA<Function>());
    });
  });

  group('Mark-as-read response parsing', () {
    test('parseMarkReadResponse reads notification envelope', () {
      final n = AppNotification.parseMarkReadResponse({
        'success': true,
        'data': {
          'notification': {
            'id': '9',
            'title': 'عنوان',
            'message': 'رسالة',
            'isRead': true,
            'readAt': '2026-07-09T08:00:00.000Z',
          },
        },
      });
      expect(n.isUnread, isFalse);
    });

    test('MarkAllReadResult supports snake_case updated_count', () {
      final r = MarkAllReadResult.parseResponse({
        'success': true,
        'data': {'updated_count': 3},
      });
      expect(r.updatedCount, 3);
    });

    test('copyWith marks notification as read locally', () {
      final unread = AppNotification(id: '1', title: 't', message: 'm', isRead: false);
      final read = unread.copyWith(isRead: true, readAt: '2026-07-09T08:00:00.000Z');
      expect(unread.isUnread, isTrue);
      expect(read.isUnread, isFalse);
    });

    test('unread count local becomes zero when all marked read', () {
      final page = NotificationsPage.parseResponse({
        'success': true,
        'data': {
          'notifications': [
            {'id': '1', 'title': 'a', 'message': 'b', 'isRead': true},
            {'id': '2', 'title': 'c', 'message': 'd', 'isRead': true},
          ],
          'total': 2,
          'limit': 50,
          'offset': 0,
        },
      });
      expect(page.unreadCountLocal, 0);
    });
  });

  group('NotificationsMarkReadController', () {
    test('prevents duplicate mark-as-read while in progress', () async {
      final mock = _RecordingMarkApi();
      final container = ProviderContainer(
        overrides: [
          notificationsApiProvider.overrideWith((ref) => mock),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(notificationsMarkReadControllerProvider.notifier);
      final inFlight = notifier.markAsRead('10');
      final duplicate = await notifier.markAsRead('10');
      await inFlight;

      expect(duplicate, isFalse);
      expect(mock.markCalls, 1);
    });

    test('mark all completes and clears loading state', () async {
      final mock = _RecordingMarkApi();
      final container = ProviderContainer(
        overrides: [
          notificationsApiProvider.overrideWith((ref) => mock),
        ],
      );
      addTearDown(container.dispose);

      final ok = await container
          .read(notificationsMarkReadControllerProvider.notifier)
          .markAllAsRead();

      expect(ok, isTrue);
      expect(mock.markAllCalls, 1);
      expect(container.read(notificationsMarkReadControllerProvider).markingAll, isFalse);
    });
  });
}

class _RecordingMarkApi extends NotificationsApi {
  _RecordingMarkApi() : super(Dio());

  int markCalls = 0;
  int markAllCalls = 0;

  @override
  Future<AppNotification> markNotificationAsRead(String notificationId) async {
    markCalls += 1;
    await Future<void>.delayed(const Duration(milliseconds: 20));
    return AppNotification(id: notificationId, title: 't', message: 'm', isRead: true);
  }

  @override
  Future<MarkAllReadResult> markAllNotificationsAsRead() async {
    markAllCalls += 1;
    return const MarkAllReadResult(updatedCount: 0);
  }

  @override
  Future<NotificationsPage> fetchNotifications({
    int limit = 50,
    int offset = 0,
    bool? isRead,
    String? type,
    String? entityType,
  }) async {
    return const NotificationsPage(notifications: [], total: 0, limit: 50, offset: 0);
  }

  @override
  Future<UnreadNotificationsCount> fetchUnreadCount() async {
    return const UnreadNotificationsCount(count: 0);
  }
}
