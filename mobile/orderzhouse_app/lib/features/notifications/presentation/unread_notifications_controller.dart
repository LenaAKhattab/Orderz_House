import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/presentation/auth_controller.dart';
import '../data/notifications_repository.dart';

final unreadNotificationsControllerProvider =
    FutureProvider.autoDispose<int>((ref) async {
  final auth = ref.watch(authControllerProvider);
  if (!auth.isAuthenticated) return 0;

  try {
    final repo = ref.read(notificationsRepositoryProvider);
    final count = await repo.fetchUnreadCount();
    return count.count;
  } catch (_) {
    // Fallback: derive from first page if unread-count endpoint fails.
    final page = await ref.read(notificationsRepositoryProvider).fetchNotifications(limit: 50);
    return page.unreadCountLocal;
  }
});
