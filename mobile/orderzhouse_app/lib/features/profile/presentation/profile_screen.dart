import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/branding/app_branding.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/constants/web_constants.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../auth/domain/auth_user.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../notifications/presentation/unread_notifications_controller.dart';
import '../domain/profile_actions.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('حسابي')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
        children: [
          if (auth.isAuthenticated && auth.user != null)
            _AuthenticatedProfileBody(user: auth.user!)
          else
            const Padding(
              padding: EdgeInsets.only(top: 48),
              child: Center(child: CircularProgressIndicator()),
            ),
        ],
      ),
    );
  }
}

class _AuthenticatedProfileBody extends ConsumerWidget {
  const _AuthenticatedProfileBody({required this.user});

  final AuthUser user;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final quickActions = profileQuickActionsForUser(user);
    final settings = profileSettingsItems(isAuthenticated: true);
    final unreadAsync = ref.watch(unreadNotificationsControllerProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _UserCard(user: user),
        const SizedBox(height: 20),
        _SectionTitle(title: 'إجراءات سريعة'),
        const SizedBox(height: 8),
        OhCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (var i = 0; i < quickActions.length; i++) ...[
                _ProfileActionTile(
                  action: quickActions[i],
                  unreadCount: quickActions[i].id == ProfileActionId.notifications
                      ? unreadAsync.maybeWhen(data: (v) => v, orElse: () => 0)
                      : null,
                  onTap: () => _openAction(context, quickActions[i]),
                ),
                if (i < quickActions.length - 1) const Divider(height: 1, indent: 56),
              ],
            ],
          ),
        ),
        const SizedBox(height: 20),
        _SectionTitle(title: 'الإعدادات'),
        const SizedBox(height: 8),
        OhCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (var i = 0; i < settings.length; i++) ...[
                _SettingsTile(
                  item: settings[i],
                  onTap: () => _handleSettingsTap(context, settings[i]),
                ),
                if (i < settings.length - 1) const Divider(height: 1, indent: 56),
              ],
            ],
          ),
        ),
        const SizedBox(height: 20),
        _SectionTitle(title: 'الحساب'),
        const SizedBox(height: 8),
        OhButton(
          label: 'تسجيل الخروج',
          outlined: true,
          onPressed: () => _confirmLogout(context, ref),
        ),
        const SizedBox(height: 16),
        if (!kReleaseMode) _DevEnvCard(),
      ],
    );
  }

  void _openAction(BuildContext context, ProfileActionItem action) {
    if (action.route.startsWith('/public/')) {
      context.push(action.route);
      return;
    }
    if (action.route == AppRoutes.myOrders || action.route == AppRoutes.marketplace) {
      context.go(action.route);
      return;
    }
    context.push(action.route);
  }

  Future<void> _confirmLogout(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('تسجيل الخروج'),
        content: const Text('هل تريد تسجيل الخروج؟'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('تسجيل الخروج')),
        ],
      ),
    );

    if (confirmed != true || !context.mounted) return;

    await ref.read(authControllerProvider.notifier).logout();
    ref.invalidate(unreadNotificationsControllerProvider);
    if (context.mounted) context.go(AppRoutes.login);
  }
}

class _UserCard extends StatelessWidget {
  const _UserCard({required this.user});

  final AuthUser user;

  @override
  Widget build(BuildContext context) {
    final status = profileStatusLabelAr(user);

    return OhCard(
      child: Row(
        children: [
          CircleAvatar(
            radius: 30,
            backgroundColor: AppColors.iconChipBg,
            child: Text(
              profileInitials(user),
              style: const TextStyle(
                color: AppColors.primary,
                fontWeight: FontWeight.w800,
                fontSize: 22,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  user.displayName,
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17),
                ),
                const SizedBox(height: 4),
                Text(user.email, style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  children: [
                    _ChipLabel(
                      label: profileRoleLabelAr(user),
                      color: AppColors.primary,
                      background: AppColors.iconChipBg,
                    ),
                    if (status != null)
                      _ChipLabel(
                        label: status,
                        color: user.isActive ? AppColors.primary : AppColors.error,
                        background: user.isActive
                            ? AppColors.secondary.withValues(alpha: 0.12)
                            : AppColors.errorSurface,
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ChipLabel extends StatelessWidget {
  const _ChipLabel({
    required this.label,
    required this.color,
    required this.background,
  });

  final String label;
  final Color color;
  final Color background;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: AppColors.textInk),
      textAlign: TextAlign.right,
    );
  }
}

class _ProfileActionTile extends StatelessWidget {
  const _ProfileActionTile({
    required this.action,
    required this.onTap,
    this.unreadCount,
  });

  final ProfileActionItem action;
  final VoidCallback onTap;
  final int? unreadCount;

  @override
  Widget build(BuildContext context) {
    final unread = unreadCount ?? 0;

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
      leading: Stack(
        clipBehavior: Clip.none,
        children: [
          Icon(action.icon, color: AppColors.primary),
          if (unread > 0)
            Positioned(
              top: -4,
              left: -4,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.error,
                  borderRadius: BorderRadius.circular(10),
                ),
                constraints: const BoxConstraints(minWidth: 18),
                child: Text(
                  unread > 99 ? '99+' : '$unread',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800),
                ),
              ),
            ),
        ],
      ),
      title: Text(action.label, style: const TextStyle(fontWeight: FontWeight.w700)),
      trailing: const Icon(Icons.chevron_left, color: AppColors.primary, size: 22),
      onTap: onTap,
    );
  }
}

class _SettingsTile extends StatelessWidget {
  const _SettingsTile({required this.item, required this.onTap});

  final ProfileSettingsItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
      leading: Icon(item.icon, color: AppColors.primary),
      title: Text(item.label, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: item.isPlaceholder
          ? Text(
              item.placeholderHint ?? '',
              style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
            )
          : null,
      trailing: item.isPlaceholder
          ? const Text('قريباً', style: TextStyle(color: AppColors.textMuted, fontSize: 12))
          : const Icon(Icons.chevron_left, color: AppColors.primary, size: 22),
      onTap: item.isPlaceholder ? null : onTap,
    );
  }
}

class _DevEnvCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return OhCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('بيئة التطوير', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
          const SizedBox(height: 6),
          Text(
            ApiConstants.baseUrl,
            textDirection: TextDirection.ltr,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
          ),
        ],
      ),
    );
  }
}

Future<void> _handleSettingsTap(BuildContext context, ProfileSettingsItem item) async {
  switch (item.id) {
    case ProfileSettingsId.openWebsite:
      final uri = Uri.tryParse(WebConstants.baseUrl);
      if (uri != null && (uri.scheme == 'http' || uri.scheme == 'https')) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
      return;
    case ProfileSettingsId.aboutApp:
      if (!context.mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('عن التطبيق'),
          content: Text(
            AppBranding.aboutBody,
            textAlign: TextAlign.right,
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('حسنًا')),
          ],
        ),
      );
      return;
    case ProfileSettingsId.terms:
    case ProfileSettingsId.privacy:
    case ProfileSettingsId.helpCenter:
      if (item.route != null) context.push(item.route!);
      return;
    case ProfileSettingsId.language:
      return;
  }
}
