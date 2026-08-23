import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/presentation/auth_controller.dart';
import '../data/notification_models.dart';
import '../data/notifications_repository.dart';

final notificationsControllerProvider =
    FutureProvider.autoDispose<NotificationsPage>((ref) async {
  final auth = ref.watch(authControllerProvider);
  if (!auth.isAuthenticated) {
    return const NotificationsPage(notifications: [], total: 0, limit: 0, offset: 0);
  }

  final repo = ref.read(notificationsRepositoryProvider);
  final page = await repo.fetchNotifications(limit: 50);
  return NotificationsPage(
    notifications: sortNotificationsUnreadFirst(page.notifications),
    total: page.total,
    limit: page.limit,
    offset: page.offset,
  );
});
