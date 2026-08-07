import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../notifications/presentation/unread_notifications_controller.dart';
import '../data/account_models.dart';
import '../data/account_repository.dart';

final accountProfileProvider =
    AsyncNotifierProvider.autoDispose<AccountProfileController, AccountProfile>(
  AccountProfileController.new,
);

class AccountProfileController extends AutoDisposeAsyncNotifier<AccountProfile> {
  @override
  Future<AccountProfile> build() {
    return ref.read(accountRepositoryProvider).getProfile();
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(accountRepositoryProvider).getProfile(),
    );
  }
}

class AccountSettingsScreen extends ConsumerWidget {
  const AccountSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(accountProfileProvider);

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(title: const Text('إعدادات الحساب')),
      body: async.when(
        loading: () => const OhLoadingBody(message: 'جاري تحميل الحساب...'),
        error: (e, _) => OhErrorBody(
          message: apiErrorMessage(e, fallback: 'تعذر تحميل إعدادات الحساب.'),
          onRetry: () => ref.read(accountProfileProvider.notifier).refresh(),
        ),
        data: (profile) => _AccountSettingsBody(profile: profile),
      ),
    );
  }
}

class _AccountSettingsBody extends ConsumerWidget {
  const _AccountSettingsBody({required this.profile});

  final AccountProfile profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        const _SectionTitle('الملف الشخصي'),
        const SizedBox(height: 8),
        _WhiteCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _InfoRow(label: 'الاسم', value: profile.displayName),
              const Divider(height: 22),
              _InfoRow(label: 'البريد الإلكتروني', value: profile.email),
              const Divider(height: 22),
              _InfoRow(
                label: 'رقم الهاتف',
                value: (profile.phone?.isNotEmpty == true) ? profile.phone! : 'غير محدد',
              ),
              const Divider(height: 22),
              _InfoRow(label: 'الدور الحالي', value: profile.roleLabelAr),
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: () => context.push(AppRoutes.accountEditProfile),
                icon: const Icon(Icons.edit_outlined, size: 18),
                label: const Text('تعديل الملف الشخصي'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        const _SectionTitle('الأمان'),
        const SizedBox(height: 8),
        _WhiteCard(
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.lock_outline_rounded, color: AppColors.primary),
            title: const Text(
              'تغيير كلمة المرور',
              style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.primaryDeep),
            ),
            subtitle: const Text('حدّث كلمة المرور لحماية حسابك'),
            trailing: const Icon(Icons.chevron_left_rounded),
            onTap: () => context.push(AppRoutes.accountChangePassword),
          ),
        ),
        const SizedBox(height: 18),
        const _SectionTitle('الحساب'),
        const SizedBox(height: 8),
        _WhiteCard(
          child: Column(
            children: [
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.delete_forever_outlined, color: AppColors.error),
                title: const Text(
                  'حذف الحساب',
                  style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.error),
                ),
                subtitle: const Text('تعطيل دائم لحسابك مع الاحتفاظ بسجلات الطلبات'),
                trailing: const Icon(Icons.chevron_left_rounded, color: AppColors.error),
                onTap: () => context.push(AppRoutes.accountDelete),
              ),
              const Divider(height: 8),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.logout_rounded, color: AppColors.error),
                title: const Text(
                  'تسجيل الخروج',
                  style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.error),
                ),
                onTap: () => confirmAccountLogout(context, ref),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

Future<void> confirmAccountLogout(BuildContext context, WidgetRef ref) async {
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

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        color: AppColors.primaryDeep,
        fontWeight: FontWeight.w800,
        fontSize: 16,
      ),
    );
  }
}

class _WhiteCard extends StatelessWidget {
  const _WhiteCard({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.cardBorder),
      ),
      child: child,
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(
            color: AppColors.primaryDeep,
            fontWeight: FontWeight.w700,
            fontSize: 15,
          ),
        ),
      ],
    );
  }
}
