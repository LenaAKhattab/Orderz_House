import 'package:dio/dio.dart';

import '../../../core/network/json_helpers.dart';
import 'notification_models.dart';

/// Notifications API — list, unread count, and mark-as-read (Phase 4E-1/4E-2).
class NotificationsApi {
  NotificationsApi(this._dio);

  final Dio _dio;

  Future<NotificationsPage> fetchNotifications({
    int limit = 50,
    int offset = 0,
    bool? isRead,
    String? type,
    String? entityType,
  }) async {
    final response = await _dio.get<dynamic>(
      '/notifications',
      queryParameters: {
        'limit': limit.clamp(1, 100),
        'offset': offset.clamp(0, 10000),
        'isRead': ?isRead,
        'type': ?((type != null && type.trim().isNotEmpty) ? type.trim() : null),
        'entityType': ?((entityType != null && entityType.trim().isNotEmpty) ? entityType.trim() : null),
      },
    );
    return NotificationsPage.parseResponse(response.data);
  }

  Future<UnreadNotificationsCount> fetchUnreadCount() async {
    final response = await _dio.get<dynamic>('/notifications/unread-count');
    return UnreadNotificationsCount.parseResponse(response.data);
  }

  Future<AppNotification> markNotificationAsRead(String notificationId) async {
    final id = notificationId.trim();
    final response = await _dio.post<dynamic>('/notifications/$id/read');
    return AppNotification.parseMarkReadResponse(response.data);
  }

  Future<MarkAllReadResult> markAllNotificationsAsRead() async {
    final response = await _dio.post<dynamic>('/notifications/read-all');
    return MarkAllReadResult.parseResponse(response.data);
  }

  Future<void> deleteNotification(String notificationId) async {
    await _dio.delete<dynamic>('/notifications/${notificationId.trim()}');
  }

  Future<int> deleteNotificationsBulk(List<String> notificationIds) async {
    final ids = notificationIds.map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
    if (ids.isEmpty) return 0;
    final response = await _dio.post<dynamic>(
      '/notifications/bulk-delete',
      data: {'ids': ids},
    );
    if (response.data is Map) {
      final data = (response.data as Map)['data'];
      if (data is Map) {
        return readInt(Map<String, dynamic>.from(data), 'deletedCount', 'deleted_count') ?? ids.length;
      }
    }
    return ids.length;
  }
}

const notificationsMarkReadErrorMessageAr = 'تعذر تحديث حالة الإشعار';
