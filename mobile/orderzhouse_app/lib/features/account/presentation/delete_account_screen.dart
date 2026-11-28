import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../notifications/presentation/unread_notifications_controller.dart';
import '../data/account_repository.dart';
import '../domain/account_validators.dart';
import '../../../core/i18n/i18n.dart';

class DeleteAccountScreen extends ConsumerStatefulWidget {
  const DeleteAccountScreen({super.key});

  @override
  ConsumerState<DeleteAccountScreen> createState() => _DeleteAccountScreenState();
}

class _DeleteAccountScreenState extends ConsumerState<DeleteAccountScreen> {
  final _formKey = GlobalKey<FormState>();
  final _password = TextEditingController();
  final _confirmation = TextEditingController();
  bool _obscure = true;
  bool _submitting = false;

  @override
  void dispose() {
    _password.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate() || _submitting) return;
    if (!isDeleteAccountConfirmationValid(_confirmation.text)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr('اكتب كلمة «حذف» للتأكيد.'))),
      );
      return;
    }

    final proceed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('تأكيد نهائي')),
        content: Text(
          tr('سيتم تعطيل حسابك الآن ولن تستطيع الدخول بعده. هل تريد المتابعة؟'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(tr('إلغاء'))),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(tr('تعطيل الحساب')),
          ),
        ],
      ),
    );
    if (proceed != true || !mounted) return;

    setState(() => _submitting = true);
    try {
      await ref.read(accountRepositoryProvider).deactivateAccount(
            currentPassword: _password.text,
            confirmation: _confirmation.text.trim(),
          );
      _password.clear();
      _confirmation.clear();
      await ref.read(authControllerProvider.notifier).logout();
      ref.invalidate(unreadNotificationsControllerProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr('تم تعطيل الحساب بنجاح'))),
      );
      context.go(AppRoutes.login);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(apiErrorMessage(e, fallback: tr('تعذر تعطيل الحساب.')))),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(title: Text(tr('حذف الحساب'))),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.error.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.error.withValues(alpha: 0.35)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    tr('حذف الحساب إجراء لا يمكن التراجع عنه بسهولة.'),
                    style: TextStyle(
                      color: AppColors.error,
                      fontWeight: FontWeight.w800,
                      height: 1.45,
                    ),
                  ),
                  SizedBox(height: 10),
                  Text(
                    tr('سيتم تعطيل حسابك ولن تستطيع الدخول.\n'
                    'سيتم حذف أو إخفاء بعض البيانات الشخصية غير الضرورية مثل رقم الهاتف والصورة الشخصية عندما يكون ذلك ممكنًا.\n'
                    'قد نحتفظ ببعض السجلات المرتبطة بالطلبات والمدفوعات والنزاعات والفواتير لأسباب تشغيلية وقانونية ومحاسبية.\n'
                    'لا يتم حذف الطلبات أو المدفوعات بما يؤثر على حقوق العملاء أو المستقلين أو السجلات المالية.'),
                    style: TextStyle(color: AppColors.primaryDeep, height: 1.55),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.cardBorder),
              ),
              child: Column(
                children: [
                  TextFormField(
                    controller: _password,
                    obscureText: _obscure,
                    autocorrect: false,
                    enableSuggestions: false,
                    validator: PasswordRules.validateCurrent,
                    decoration: InputDecoration(
                      labelText: tr('كلمة المرور الحالية'),
                      suffixIcon: IconButton(
                        onPressed: () => setState(() => _obscure = !_obscure),
                        icon: Icon(
                          _obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _confirmation,
                    validator: (v) {
                      if (!isDeleteAccountConfirmationValid(v)) {
                        return tr('اكتب كلمة «حذف» حرفياً للتأكيد.');
                      }
                      return null;
                    },
                    decoration: InputDecoration(
                      labelText: tr('اكتب «حذف» للتأكيد'),
                      helperText: tr('يلزم كتابة كلمة حذف للمتابعة'),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: AppColors.error),
              onPressed: _submitting ? null : _submit,
              child: Text(_submitting ? tr('جاري التعطيل...') : tr('حذف الحساب')),
            ),
          ],
        ),
      ),
    );
  }
}
