import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import 'notification_models.dart';
import 'notifications_api.dart';

final notificationsApiProvider = Provider<NotificationsApi>((ref) {
  return NotificationsApi(ref.watch(dioProvider));
});

class NotificationsRepository {
  NotificationsRepository(this._api);

  final NotificationsApi _api;

  Future<NotificationsPage> fetchNotifications({int limit = 50, int offset = 0}) =>
      _api.fetchNotifications(limit: limit, offset: offset);

  Future<UnreadNotificationsCount> fetchUnreadCount() => _api.fetchUnreadCount();

  Future<AppNotification> markNotificationAsRead(String notificationId) =>
      _api.markNotificationAsRead(notificationId);

  Future<MarkAllReadResult> markAllNotificationsAsRead() => _api.markAllNotificationsAsRead();

  Future<void> deleteNotification(String notificationId) =>
      _api.deleteNotification(notificationId);

  Future<int> deleteNotificationsBulk(List<String> notificationIds) =>
      _api.deleteNotificationsBulk(notificationIds);
}

final notificationsRepositoryProvider = Provider<NotificationsRepository>((ref) {
  return NotificationsRepository(ref.watch(notificationsApiProvider));
});
