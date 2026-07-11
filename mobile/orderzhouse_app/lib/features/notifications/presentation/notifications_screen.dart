import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/notification_models.dart';
import '../data/notifications_api.dart';
import 'notification_tile.dart';
import 'notifications_controller.dart';
import 'notifications_mark_read_controller.dart';
import 'unread_notifications_controller.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  Future<void> _refresh() async {
    ref.invalidate(notificationsControllerProvider);
    ref.invalidate(unreadNotificationsControllerProvider);
    await ref.read(notificationsControllerProvider.future);
  }

  Future<void> _openNotification(AppNotification item) async {
    if (!mounted) return;
    final currentUserRole = ref.read(authControllerProvider).user?.effectiveRole;
    showNotificationDetailSheet(
      context,
      item,
      currentUserRole: currentUserRole,
    );

    if (!item.isUnread) return;

    final ok = await ref.read(notificationsMarkReadControllerProvider.notifier).markAsRead(item.id);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(notificationsMarkReadErrorMessageAr)),
      );
    }
  }

  Future<void> _confirmMarkAll() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('تعليم الكل كمقروء'),
        content: const Text('هل تريد تعليم جميع الإشعارات كمقروءة؟'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('تأكيد'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    final ok = await ref.read(notificationsMarkReadControllerProvider.notifier).markAllAsRead();
    if (!mounted) return;

    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم تعليم جميع الإشعارات كمقروءة')),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(notificationsMarkReadErrorMessageAr)),
      );
    }
  }

  bool _shouldShowMarkAll({
    required AsyncValue<int> unreadAsync,
    required int localUnread,
  }) {
    final remoteUnread = unreadAsync.maybeWhen(data: (v) => v, orElse: () => 0);
    return remoteUnread > 0 || localUnread > 0;
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final pageAsync = ref.watch(notificationsControllerProvider);
    final unreadAsync = ref.watch(unreadNotificationsControllerProvider);
    final markReadState = ref.watch(notificationsMarkReadControllerProvider);

    if (!auth.isAuthenticated) {
      return Scaffold(
        appBar: AppBar(title: const Text('الإشعارات')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const OhEmptyBody(
                  message: 'سجّل الدخول لعرض إشعاراتك.',
                  icon: Icons.lock_outline,
                ),
                const SizedBox(height: 16),
                OhButton(
                  label: 'تسجيل الدخول',
                  onPressed: () => context.push(AppRoutes.loginWithRedirect(AppRoutes.notifications)),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final showMarkAll = pageAsync.maybeWhen(
      data: (page) => _shouldShowMarkAll(unreadAsync: unreadAsync, localUnread: page.unreadCountLocal),
      orElse: () => unreadAsync.maybeWhen(data: (v) => v > 0, orElse: () => false),
    );

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(
        title: const Text('الإشعارات'),
        actions: [
          if (showMarkAll)
            TextButton(
              onPressed: markReadState.markingAll ? null : _confirmMarkAll,
              child: markReadState.markingAll
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('تعليم الكل كمقروء'),
            ),
        ],
      ),
      body: pageAsync.when(
        loading: () => const OhLoadingBody(message: 'جاري تحميل الإشعارات...'),
        error: (error, _) => OhErrorBody(
          message: 'تعذّر تحميل الإشعارات. حاول مرة أخرى.',
          onRetry: () => ref.invalidate(notificationsControllerProvider),
        ),
        data: (page) {
          if (page.notifications.isEmpty) {
            return RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [
                  SizedBox(height: 120),
                  OhEmptyBody(
                    message: 'لا توجد إشعارات حتى الآن',
                    icon: Icons.notifications_none_outlined,
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              physics: const AlwaysScrollableScrollPhysics(),
              itemCount: page.notifications.length,
              itemBuilder: (context, index) {
                final item = page.notifications[index];
                final isMarking = markReadState.isMarking(item.id);
                return NotificationTile(
                  notification: item,
                  isMarking: isMarking,
                  onTap: isMarking ? null : () => _openNotification(item),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
