import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/notification_models.dart';
import '../data/notifications_api.dart';
import '../data/notifications_repository.dart';
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
  final Set<String> _selectedIds = {};
  bool _deleting = false;

  Future<void> _refresh() async {
    ref.invalidate(notificationsControllerProvider);
    ref.invalidate(unreadNotificationsControllerProvider);
    await ref.read(notificationsControllerProvider.future);
    if (mounted) setState(_selectedIds.clear);
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
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('تأكيد')),
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

  Future<void> _confirmDeleteSelected() async {
    if (_selectedIds.isEmpty || _deleting) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('حذف الإشعارات'),
        content: const Text('هل تريد حذف الإشعارات المحددة؟'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('حذف')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _deleting = true);
    try {
      await ref.read(notificationsRepositoryProvider).deleteNotificationsBulk(_selectedIds.toList());
      if (!mounted) return;
      setState(_selectedIds.clear);
      await _refresh();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم حذف الإشعارات المحددة')),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تعذر حذف الإشعارات المحددة')),
      );
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  void _toggleSelectAll(List<AppNotification> items, bool? value) {
    setState(() {
      if (value == true) {
        _selectedIds
          ..clear()
          ..addAll(items.map((e) => e.id));
      } else {
        _selectedIds.clear();
      }
    });
  }

  void _toggleSelection(String id) {
    setState(() {
      if (_selectedIds.contains(id)) {
        _selectedIds.remove(id);
      } else {
        _selectedIds.add(id);
      }
    });
  }

  bool get _selectionActive => _selectedIds.isNotEmpty;

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

    final allSelected = pageAsync.maybeWhen(
      data: (page) => page.notifications.isNotEmpty && _selectedIds.length == page.notifications.length,
      orElse: () => false,
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
      bottomNavigationBar: _selectedIds.isEmpty
          ? null
          : SafeArea(
              child: Material(
                elevation: 6,
                color: Colors.white,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  child: Row(
                    children: [
                      Text('${_selectedIds.length} محدد'),
                      const Spacer(),
                      TextButton(
                        onPressed: _deleting ? null : () => setState(_selectedIds.clear),
                        child: const Text('إلغاء'),
                      ),
                      FilledButton(
                        onPressed: _deleting ? null : _confirmDeleteSelected,
                        child: _deleting
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : const Text('حذف المحدد'),
                      ),
                    ],
                  ),
                ),
              ),
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
            child: ListView(
              padding: const EdgeInsets.all(16),
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                Row(
                  children: [
                    Checkbox(
                      value: allSelected,
                      tristate: true,
                      onChanged: (v) => _toggleSelectAll(page.notifications, v),
                    ),
                    const Text('تحديد الكل'),
                  ],
                ),
                const SizedBox(height: 8),
                ...page.notifications.map((item) {
                  final isMarking = markReadState.isMarking(item.id);
                  final selected = _selectedIds.contains(item.id);
                  return GestureDetector(
                    onLongPress: isMarking
                        ? null
                        : () {
                            setState(() => _selectedIds.add(item.id));
                          },
                    child: NotificationTile(
                    notification: item,
                    isMarking: isMarking,
                    selected: selected,
                    selectionMode: _selectionActive,
                    onSelectedChanged: (value) {
                      setState(() {
                        if (value) {
                          _selectedIds.add(item.id);
                        } else {
                          _selectedIds.remove(item.id);
                        }
                      });
                    },
                    onTap: isMarking
                        ? null
                        : () {
                            if (_selectionActive) {
                              _toggleSelection(item.id);
                            } else {
                              _openNotification(item);
                            }
                          },
                    ),
                  );
                }),
              ],
            ),
          );
        },
      ),
    );
  }
}
