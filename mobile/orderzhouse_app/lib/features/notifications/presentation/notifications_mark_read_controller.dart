import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/notifications_repository.dart';
import 'notifications_controller.dart';
import 'unread_notifications_controller.dart';

class NotificationsMarkReadState {
  const NotificationsMarkReadState({
    this.markingIds = const {},
    this.markingAll = false,
  });

  final Set<String> markingIds;
  final bool markingAll;

  bool isMarking(String id) => markingIds.contains(id);

  NotificationsMarkReadState copyWith({
    Set<String>? markingIds,
    bool? markingAll,
  }) {
    return NotificationsMarkReadState(
      markingIds: markingIds ?? this.markingIds,
      markingAll: markingAll ?? this.markingAll,
    );
  }
}

class NotificationsMarkReadController extends Notifier<NotificationsMarkReadState> {
  @override
  NotificationsMarkReadState build() => const NotificationsMarkReadState();

  void _refreshProviders() {
    ref.invalidate(notificationsControllerProvider);
    ref.invalidate(unreadNotificationsControllerProvider);
  }

  Future<bool> markAsRead(String notificationId) async {
    final id = notificationId.trim();
    if (id.isEmpty || state.isMarking(id)) return false;

    state = state.copyWith(markingIds: {...state.markingIds, id});
    try {
      await ref.read(notificationsRepositoryProvider).markNotificationAsRead(id);
      _refreshProviders();
      return true;
    } catch (_) {
      return false;
    } finally {
      final next = Set<String>.from(state.markingIds)..remove(id);
      state = state.copyWith(markingIds: next);
    }
  }

  Future<bool> markAllAsRead() async {
    if (state.markingAll) return false;

    state = state.copyWith(markingAll: true);
    try {
      await ref.read(notificationsRepositoryProvider).markAllNotificationsAsRead();
      _refreshProviders();
      return true;
    } catch (_) {
      return false;
    } finally {
      state = state.copyWith(markingAll: false);
    }
  }
}

final notificationsMarkReadControllerProvider =
    NotifierProvider<NotificationsMarkReadController, NotificationsMarkReadState>(
  NotificationsMarkReadController.new,
);
