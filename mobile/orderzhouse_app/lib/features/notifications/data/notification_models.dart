import '../../../core/network/json_helpers.dart';

class AppNotification {
  const AppNotification({
    required this.id,
    required this.title,
    required this.message,
    this.type,
    this.createdAt,
    this.readAt,
    this.isRead = false,
    this.entityType,
    this.entityId,
    this.actionUrl,
    this.priority,
    this.actorDisplayName,
    this.recipientRole,
  });

  final String id;
  final String title;
  final String message;
  final String? type;
  final String? createdAt;
  final String? readAt;
  final bool isRead;
  final String? entityType;
  final String? entityId;
  final String? actionUrl;
  final String? priority;
  final String? actorDisplayName;
  final String? recipientRole;

  bool get isUnread => !isRead;

  AppNotification copyWith({
    String? id,
    String? title,
    String? message,
    String? type,
    String? createdAt,
    String? readAt,
    bool? isRead,
    String? entityType,
    String? entityId,
    String? actionUrl,
    String? priority,
    String? actorDisplayName,
    String? recipientRole,
  }) {
    return AppNotification(
      id: id ?? this.id,
      title: title ?? this.title,
      message: message ?? this.message,
      type: type ?? this.type,
      createdAt: createdAt ?? this.createdAt,
      readAt: readAt ?? this.readAt,
      isRead: isRead ?? this.isRead,
      entityType: entityType ?? this.entityType,
      entityId: entityId ?? this.entityId,
      actionUrl: actionUrl ?? this.actionUrl,
      priority: priority ?? this.priority,
      actorDisplayName: actorDisplayName ?? this.actorDisplayName,
      recipientRole: recipientRole ?? this.recipientRole,
    );
  }

  static AppNotification parseMarkReadResponse(dynamic data) {
    if (data is Map<String, dynamic>) {
      final envelope = data['data'];
      if (envelope is Map<String, dynamic>) {
        final notification = envelope['notification'];
        if (notification is Map<String, dynamic>) {
          return AppNotification.fromJson(notification);
        }
      }
    }
    throw const FormatException('Invalid mark-as-read response');
  }

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    final actor = json['actor'];
    String? actorName;
    if (actor is Map) {
      actorName = readString(Map<String, dynamic>.from(actor), 'displayName', 'display_name');
      if (actorName.isEmpty) {
        actorName = readString(Map<String, dynamic>.from(actor), 'fullName', 'full_name');
      }
    }

    return AppNotification(
      id: readString(json, 'id', 'id'),
      title: readString(json, 'title', 'title'),
      message: readString(json, 'message', 'message'),
      type: readString(json, 'type', 'type').isEmpty ? null : readString(json, 'type', 'type'),
      createdAt: readString(json, 'createdAt', 'created_at').isEmpty
          ? null
          : readString(json, 'createdAt', 'created_at'),
      readAt: readString(json, 'readAt', 'read_at').isEmpty ? null : readString(json, 'readAt', 'read_at'),
      isRead: readBool(json, 'isRead', 'is_read'),
      entityType: readString(json, 'entityType', 'entity_type').isEmpty
          ? null
          : readString(json, 'entityType', 'entity_type'),
      entityId: readString(json, 'entityId', 'entity_id').isEmpty
          ? null
          : readString(json, 'entityId', 'entity_id'),
      actionUrl: readString(json, 'link', 'link').isEmpty ? null : readString(json, 'link', 'link'),
      priority: readString(json, 'priority', 'priority').isEmpty
          ? null
          : readString(json, 'priority', 'priority'),
      actorDisplayName: actorName?.isEmpty == true ? null : actorName,
      recipientRole: readString(json, 'recipientRole', 'recipient_role').isEmpty
          ? null
          : readString(json, 'recipientRole', 'recipient_role'),
    );
  }
}

class NotificationsPage {
  const NotificationsPage({
    required this.notifications,
    required this.total,
    required this.limit,
    required this.offset,
  });

  final List<AppNotification> notifications;
  final int total;
  final int limit;
  final int offset;

  factory NotificationsPage.fromJson(Map<String, dynamic> json) {
    final raw = json['notifications'];
    final list = <AppNotification>[];
    if (raw is List) {
      for (final item in raw) {
        if (item is Map) {
          list.add(AppNotification.fromJson(Map<String, dynamic>.from(item)));
        }
      }
    }
    return NotificationsPage(
      notifications: list,
      total: readInt(json, 'total', 'total') ?? list.length,
      limit: readInt(json, 'limit', 'limit') ?? list.length,
      offset: readInt(json, 'offset', 'offset') ?? 0,
    );
  }

  static NotificationsPage parseResponse(dynamic data) {
    if (data is Map<String, dynamic>) {
      final envelope = data['data'];
      if (envelope is Map<String, dynamic>) {
        return NotificationsPage.fromJson(envelope);
      }
      if (data.containsKey('notifications')) {
        return NotificationsPage.fromJson(data);
      }
    }
    return const NotificationsPage(notifications: [], total: 0, limit: 0, offset: 0);
  }

  int get unreadCountLocal => notifications.where((n) => n.isUnread).length;
}

class UnreadNotificationsCount {
  const UnreadNotificationsCount({required this.count});

  final int count;

  factory UnreadNotificationsCount.fromJson(Map<String, dynamic> json) {
    final value = readInt(json, 'unreadCount', 'unread_count') ??
        readInt(json, 'count', 'count') ??
        0;
    return UnreadNotificationsCount(count: value);
  }

  static UnreadNotificationsCount parseResponse(dynamic data) {
    if (data is Map<String, dynamic>) {
      final envelope = data['data'];
      if (envelope is Map<String, dynamic>) {
        return UnreadNotificationsCount.fromJson(envelope);
      }
    }
    return const UnreadNotificationsCount(count: 0);
  }
}

class MarkAllReadResult {
  const MarkAllReadResult({required this.updatedCount});

  final int updatedCount;

  factory MarkAllReadResult.fromJson(Map<String, dynamic> json) {
    return MarkAllReadResult(
      updatedCount: readInt(json, 'updatedCount', 'updated_count') ?? 0,
    );
  }

  static MarkAllReadResult parseResponse(dynamic data) {
    if (data is Map<String, dynamic>) {
      final envelope = data['data'];
      if (envelope is Map<String, dynamic>) {
        return MarkAllReadResult.fromJson(envelope);
      }
    }
    return const MarkAllReadResult(updatedCount: 0);
  }
}

String notificationTypeLabel(String? type) {
  final raw = (type ?? '').trim().toLowerCase();
  if (raw.isEmpty) return 'إشعار';
  if (raw.contains('pantry')) return 'طلب';
  if (raw.contains('order')) return 'طلب';
  if (raw.contains('claim') || raw.contains('financial')) return 'مطالبة مالية';
  if (raw.contains('subscription') || raw.contains('plan')) return 'اشتراك';
  if (raw.contains('course')) return 'دورة';
  if (raw.contains('message') || raw.contains('chat')) return 'رسالة';
  if (raw.contains('payment') || raw.contains('stripe')) return 'دفع';
  if (raw.contains('delivery')) return 'تسليم';
  if (raw.contains('bid')) return 'عرض سعر';
  return 'إشعار';
}

String formatNotificationDateTime(String? raw) {
  if (raw == null || raw.isEmpty) return '—';
  final parsed = DateTime.tryParse(raw);
  if (parsed == null) return raw;
  final local = parsed.toLocal();
  final now = DateTime.now();
  final diff = now.difference(local);
  if (diff.inMinutes < 1) return 'الآن';
  if (diff.inMinutes < 60) return 'منذ ${diff.inMinutes} دقيقة';
  if (diff.inHours < 24) return 'منذ ${diff.inHours} ساعة';
  if (diff.inDays < 7) return 'منذ ${diff.inDays} يوم';
  return '${local.day}/${local.month}/${local.year} ${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
}
