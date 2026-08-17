import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/branding/app_branding.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
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
      backgroundColor: AppColors.homeMobileBg,
      body: auth.isAuthenticated && auth.user != null
          ? _AuthenticatedProfileBody(user: auth.user!)
          : const Center(child: CircularProgressIndicator()),
    );
  }
}

class _AuthenticatedProfileBody extends ConsumerWidget {
  const _AuthenticatedProfileBody({required this.user});

  final AuthUser user;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final quickActions = profileQuickActionsForUser(user);
    final accountManagement = profileAccountManagementItems();
    final settings = profileSettingsItems();
    final unreadAsync = ref.watch(unreadNotificationsControllerProvider);
    final unread = unreadAsync.maybeWhen(data: (v) => v, orElse: () => 0);
    final bottomInset = MediaQuery.paddingOf(context).bottom;

    return Stack(
      children: [
        const _ProfileAtmosphere(),
        SafeArea(
          bottom: false,
          child: ListView(
            padding: EdgeInsets.fromLTRB(20, 8, 20, 28 + bottomInset),
            children: [
              _ProfileHeader(unread: unread),
              const SizedBox(height: 18),
              _ProfileHeroCard(user: user, unread: unread),
              const SizedBox(height: 14),
              _SoftMenuCard(
                children: [
                  for (var i = 0; i < quickActions.length; i++) ...[
                    _SoftMenuTile(
                      icon: quickActions[i].icon,
                      label: quickActions[i].label,
                      badge: quickActions[i].id == ProfileActionId.notifications && unread > 0
                          ? (unread > 99 ? '99+' : '$unread')
                          : null,
                      onTap: () => _openAction(context, quickActions[i]),
                    ),
                    if (i < quickActions.length - 1) const _SoftDivider(),
                  ],
                ],
              ),
              const SizedBox(height: 14),
              const Padding(
                padding: EdgeInsetsDirectional.only(start: 4, bottom: 8),
                child: Text(
                  'إدارة الحساب',
                  style: TextStyle(
                    color: AppColors.primaryDeep,
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                  ),
                ),
              ),
              _SoftMenuCard(
                children: [
                  for (var i = 0; i < accountManagement.length; i++) ...[
                    _SoftMenuTile(
                      icon: accountManagement[i].icon,
                      label: accountManagement[i].label,
                      onTap: () => _handleSettingsTap(context, accountManagement[i]),
                    ),
                    if (i < accountManagement.length - 1) const _SoftDivider(),
                  ],
                  const _SoftDivider(),
                  _SoftMenuTile(
                    icon: Icons.logout_rounded,
                    label: 'تسجيل الخروج',
                    accent: AppColors.error,
                    onTap: () => _confirmLogout(context, ref),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              _SoftMenuCard(
                children: [
                  for (var i = 0; i < settings.length; i++) ...[
                    _SoftMenuTile(
                      icon: settings[i].icon,
                      label: settings[i].label,
                      subtitle: settings[i].isPlaceholder ? settings[i].placeholderHint : null,
                      trailingHint: settings[i].isPlaceholder ? 'قريباً' : null,
                      enabled: !settings[i].isPlaceholder,
                      onTap: () => _handleSettingsTap(context, settings[i]),
                    ),
                    if (i < settings.length - 1) const _SoftDivider(),
                  ],
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  void _openAction(BuildContext context, ProfileActionItem action) {
    if (action.route.startsWith('/public/')) {
      context.push(action.route);
      return;
    }
    if (action.route == AppRoutes.home ||
        action.route == AppRoutes.myOrders ||
        action.route == AppRoutes.marketplace ||
        action.route == AppRoutes.courses) {
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

class _ProfileAtmosphere extends StatelessWidget {
  const _ProfileAtmosphere();

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: SizedBox.expand(
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                AppColors.secondary.withValues(alpha: 0.18),
                AppColors.homeMobileBg,
                AppColors.homeMobileBg,
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader({required this.unread});

  final int unread;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Expanded(
          child: Text(
            'حسابي',
            style: TextStyle(
              color: AppColors.primaryDeep,
              fontSize: 30,
              fontWeight: FontWeight.w800,
              height: 1.15,
            ),
            textAlign: TextAlign.right,
          ),
        ),
        const SizedBox(width: 12),
        Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: () => context.push(AppRoutes.notifications),
            customBorder: const CircleBorder(),
            child: Ink(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: AppColors.primary.withValues(alpha: 0.08),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Stack(
                alignment: Alignment.center,
                clipBehavior: Clip.none,
                children: [
                  const Icon(Icons.notifications_none_rounded, color: AppColors.textInk, size: 22),
                  if (unread > 0)
                    Positioned(
                      top: 10,
                      left: 10,
                      child: Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(
                          color: AppColors.error,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _ProfileHeroCard extends StatelessWidget {
  const _ProfileHeroCard({required this.user, required this.unread});

  final AuthUser user;
  final int unread;

  @override
  Widget build(BuildContext context) {
    final role = profileRoleLabelAr(user);
    final status = profileStatusLabelAr(user) ?? 'الحساب نشط';
    final isFreelancer = user.usesFreelancerExperience;
    final isSuperAdmin = user.usesSuperAdminExperience;

    return Container(
      padding: const EdgeInsets.fromLTRB(18, 22, 18, 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(32),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.08),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(5),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: AppColors.secondary.withValues(alpha: 0.55),
                width: 2,
              ),
            ),
            child: CircleAvatar(
              radius: 44,
              backgroundColor: AppColors.iconChipBg,
              child: Text(
                profileInitials(user),
                style: const TextStyle(
                  color: AppColors.primary,
                  fontWeight: FontWeight.w800,
                  fontSize: 30,
                ),
              ),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Flexible(
                child: Text(
                  user.displayName,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: AppColors.textInk,
                    fontWeight: FontWeight.w800,
                    fontSize: 20,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: AppColors.primaryDeep,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      isFreelancer ? Icons.workspace_premium_rounded : Icons.verified_rounded,
                      color: Colors.white,
                      size: 14,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      role,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            user.email,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _StatBox(value: role, label: 'الدور'),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _StatBox(value: unread > 0 ? '$unread' : '0', label: 'إشعارات'),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _StatBox(
                  value: user.isActive ? 'نشط' : 'موقوف',
                  label: 'الحالة',
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (!isSuperAdmin)
            _ProfileCtaBanner(
              title: isFreelancer ? 'تابع أعمالك ومستحقاتك من مكان واحد' : 'أنشئ طلبك التالي بسهولة',
              actionLabel: isFreelancer ? 'طلباتي' : 'طلب جديد',
              onPressed: () {
                if (isFreelancer) {
                  context.go(AppRoutes.myOrders);
                } else {
                  context.push(AppRoutes.clientCreateOrder);
                }
              },
            ),
          if (isSuperAdmin)
            _ProfileCtaBanner(
              title: 'راجع المهام العاجلة من مركز المشرف الأعلى',
              actionLabel: 'مركز المهام',
              onPressed: () => GoRouter.of(context).go(AppRoutes.home),
            ),
          if (status.isNotEmpty && !user.isActive) ...[
            const SizedBox(height: 8),
            Text(
              status,
              style: const TextStyle(color: AppColors.error, fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ],
        ],
      ),
    );
  }
}

class _StatBox extends StatelessWidget {
  const _StatBox({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFF7F8FB),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        children: [
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: AppColors.primaryDeep,
              fontWeight: FontWeight.w800,
              fontSize: 16,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
          ),
        ],
      ),
    );
  }
}

class _ProfileCtaBanner extends StatelessWidget {
  const _ProfileCtaBanner({
    required this.title,
    required this.actionLabel,
    required this.onPressed,
  });

  final String title;
  final String actionLabel;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
      decoration: BoxDecoration(
        color: AppColors.primaryDeep,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          const Icon(Icons.auto_awesome_rounded, color: Colors.white, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              title,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.92),
                fontWeight: FontWeight.w600,
                fontSize: 12,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Material(
            color: Colors.white,
            borderRadius: BorderRadius.circular(999),
            child: InkWell(
              onTap: onPressed,
              borderRadius: BorderRadius.circular(999),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                child: Text(
                  actionLabel,
                  style: const TextStyle(
                    color: AppColors.primaryDeep,
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SoftMenuCard extends StatelessWidget {
  const _SoftMenuCard({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(28),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.06),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(children: children),
    );
  }
}

class _SoftDivider extends StatelessWidget {
  const _SoftDivider();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(horizontal: 18),
      child: Divider(height: 1, color: Color(0xFFE8ECF2)),
    );
  }
}

class _SoftMenuTile extends StatelessWidget {
  const _SoftMenuTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.subtitle,
    this.trailingHint,
    this.badge,
    this.accent,
    this.enabled = true,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final String? subtitle;
  final String? trailingHint;
  final String? badge;
  final Color? accent;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final color = accent ?? AppColors.textInk;

    return InkWell(
      onTap: enabled ? onTap : null,
      borderRadius: BorderRadius.circular(28),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 15),
        child: Row(
          children: [
            Icon(icon, color: enabled ? color : AppColors.textMuted, size: 22),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    label,
                    textAlign: TextAlign.right,
                    style: TextStyle(
                      color: enabled ? color : AppColors.textMuted,
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                    ),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitle!,
                      textAlign: TextAlign.right,
                      style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                    ),
                  ],
                ],
              ),
            ),
            if (badge != null) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.error,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  badge!,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
            if (trailingHint != null) ...[
              const SizedBox(width: 8),
              Text(
                trailingHint!,
                style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
              ),
            ] else if (enabled) ...[
              const SizedBox(width: 6),
              Icon(
                Icons.chevron_left_rounded,
                color: AppColors.textMuted.withValues(alpha: 0.7),
                size: 20,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

Future<void> _handleSettingsTap(BuildContext context, ProfileSettingsItem item) async {
  switch (item.id) {
    case ProfileSettingsId.accountSettings:
      context.push(item.route ?? AppRoutes.accountSettings);
      return;
    case ProfileSettingsId.openWebsite:
      final uri = Uri.parse(AppBranding.publicWebsiteUrl);
      await launchUrl(uri, mode: LaunchMode.externalApplication);
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
      if (item.route != null) context.push(item.route!);
      return;
    case ProfileSettingsId.contactUs:
      if (!context.mounted) return;
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('تواصل معنا'),
          content: const Text(
            'هل تريد الانتقال إلى واتساب للتواصل مع فريق Orderz House؟',
            textAlign: TextAlign.right,
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('إلغاء')),
            FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('فتح واتساب')),
          ],
        ),
      );
      if (confirmed != true || !context.mounted) return;
      final uri = Uri.parse(AppBranding.whatsappContactUrl);
      final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!launched && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تعذر فتح واتساب. تأكد من تثبيته على الجهاز.')),
        );
      }
      return;
  }
}
