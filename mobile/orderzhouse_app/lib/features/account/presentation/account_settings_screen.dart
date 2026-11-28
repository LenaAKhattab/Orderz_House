import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/i18n/language_controller.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../notifications/presentation/unread_notifications_controller.dart';
import '../../push/data/push_notification_service.dart';
import '../data/account_models.dart';
import '../data/account_repository.dart';
import '../../currency/presentation/preferred_display_currency_settings.dart';
import '../../../core/i18n/i18n.dart';

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
      appBar: AppBar(title: Text(tr('إعدادات الحساب'))),
      body: async.when(
        loading: () => OhLoadingBody(message: tr('جاري تحميل الحساب...')),
        error: (e, _) => OhErrorBody(
          message: apiErrorMessage(e, fallback: tr('تعذر تحميل إعدادات الحساب.')),
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
        const _WhiteCard(child: LanguageSettingsTile()),
        const SizedBox(height: 16),
        _SectionTitle(tr('الملف الشخصي')),
        const SizedBox(height: 8),
        _WhiteCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _InfoRow(label: tr('الاسم'), value: profile.displayName),
              const Divider(height: 22),
              _InfoRow(label: tr('البريد الإلكتروني'), value: profile.email),
              const Divider(height: 22),
              _InfoRow(
                label: tr('رقم الهاتف'),
                value: (profile.phone?.isNotEmpty == true) ? profile.phone! : tr('غير محدد'),
              ),
              const Divider(height: 22),
              _InfoRow(label: tr('الدور الحالي'), value: profile.roleLabelAr),
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: () => context.push(AppRoutes.accountEditProfile),
                icon: const Icon(Icons.edit_outlined, size: 18),
                label: Text(tr('تعديل الملف الشخصي')),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        _SectionTitle(tr('الأمان')),
        const SizedBox(height: 8),
        _WhiteCard(
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.lock_outline_rounded, color: AppColors.primary),
            title: Text(
              tr('تغيير كلمة المرور'),
              style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.primaryDeep),
            ),
            subtitle: Text(tr('حدّث كلمة المرور لحماية حسابك')),
            trailing: Icon(AppI18n.isEnglish ? Icons.chevron_right_rounded : Icons.chevron_left_rounded),
            onTap: () => context.push(AppRoutes.accountChangePassword),
          ),
        ),
        const SizedBox(height: 18),
_SectionTitle(tr('تشخيص مهني')),
const SizedBox(height: 8),
const _WhiteCard(child: _PushDiagnosticsTile()),

const SizedBox(height: 18),

_SectionTitle(tr('العرض')),
const SizedBox(height: 8),
const _WhiteCard(child: PreferredDisplayCurrencySettings()),
        const SizedBox(height: 18),
        _SectionTitle(tr('الحساب')),
        const SizedBox(height: 8),
        _WhiteCard(
          child: Column(
            children: [
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.delete_forever_outlined, color: AppColors.error),
                title: Text(
                  tr('حذف الحساب'),
                  style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.error),
                ),
                subtitle: Text(tr('تعطيل دائم لحسابك مع الاحتفاظ بسجلات الطلبات')),
                trailing: Icon(AppI18n.isEnglish ? Icons.chevron_right_rounded : Icons.chevron_left_rounded, color: AppColors.error),
                onTap: () => context.push(AppRoutes.accountDelete),
              ),
              const Divider(height: 8),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.logout_rounded, color: AppColors.error),
                title: Text(
                  tr('تسجيل الخروج'),
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

class _PushDiagnosticsTile extends ConsumerStatefulWidget {
  const _PushDiagnosticsTile();

  @override
  ConsumerState<_PushDiagnosticsTile> createState() => _PushDiagnosticsTileState();
}

class _PushDiagnosticsTileState extends ConsumerState<_PushDiagnosticsTile> {
  bool _running = false;

  Future<void> _run() async {
    if (_running) return;
    setState(() => _running = true);
    try {
      final result =
          await ref.read(pushNotificationServiceProvider).runRegistrationDiagnostics();
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(tr('تشخيص الإشعارات')),
          content: SingleChildScrollView(
            child: SelectableText(
              result.toUserSummary(),
              style: const TextStyle(height: 1.45, fontSize: 14),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: Text(tr('حسناً')),
            ),
          ],
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(apiErrorMessage(e, fallback: tr('تعذر تشغيل التشخيص.')))),
      );
    } finally {
      if (mounted) setState(() => _running = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(
        Icons.notifications_active_outlined,
        color: _running ? AppColors.textMuted : AppColors.primary,
      ),
      title: Text(
        tr('تشخيص الإشعارات'),
        style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.primaryDeep),
      ),
      subtitle: Text(
        _running
            ? tr('جاري الفحص… قد يستغرق حتى 10 ثوانٍ على iOS')
            : tr('مؤقت — يختبر إذن الإشعارات وتسجيل الجهاز'),
      ),
      trailing: _running
          ? const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : const Icon(Icons.play_circle_outline_rounded),
      onTap: _running ? null : _run,
    );
  }
}

Future<void> confirmAccountLogout(BuildContext context, WidgetRef ref) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(tr('تسجيل الخروج')),
      content: Text(tr('هل تريد تسجيل الخروج؟')),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(tr('إلغاء'))),
        FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text(tr('تسجيل الخروج'))),
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
