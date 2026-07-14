import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import 'auth_controller.dart';
import 'auth_form_widgets.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _firstName = TextEditingController();
  final _fatherName = TextEditingController();
  final _familyName = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirmPassword = TextEditingController();
  final _phoneNumber = TextEditingController(text: '790000000');
  bool _obscurePassword = true;
  bool _obscureConfirm = true;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _firstName.dispose();
    _fatherName.dispose();
    _familyName.dispose();
    _email.dispose();
    _password.dispose();
    _confirmPassword.dispose();
    _phoneNumber.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final body = {
        'firstName': _firstName.text.trim(),
        'fatherName': _fatherName.text.trim(),
        'familyName': _familyName.text.trim(),
        'email': _email.text.trim(),
        'password': _password.text,
        'confirmPassword': _confirmPassword.text,
        'accountType': 'client',
        'country': 'JO',
        'phone': {'countryCode': '+962', 'number': _phoneNumber.text.trim()},
        'whatsApp': {'countryCode': '+962', 'number': _phoneNumber.text.trim()},
        'gender': 'ذكر',
        'termsAccepted': true,
      };
      await ref.read(authControllerProvider.notifier).register(body);
      if (!mounted) return;
      context.go('${AppRoutes.otp}?email=${Uri.encodeComponent(_email.text.trim())}');
    } catch (e) {
      setState(() => _error = apiErrorMessage(e, fallback: 'تعذر إنشاء الحساب.'));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      showBack: true,
      child: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 28),
          children: [
            const AuthHeroHeader(
              title: 'إنشاء حساب',
              subtitle: 'أدخل بياناتك ثم أكّد بريدك برمز التحقق.',
              showLogo: false,
            ),
            const SizedBox(height: 28),
            if (_error != null) ...[
              OhErrorBanner(message: _error!),
              const SizedBox(height: 14),
            ],
            AuthPillField(
              controller: _firstName,
              hint: 'الاسم الأول',
              prefixIcon: Icons.person_outline_rounded,
              textInputAction: TextInputAction.next,
              validator: (v) => v == null || v.trim().isEmpty ? 'مطلوب' : null,
            ),
            const SizedBox(height: 12),
            AuthPillField(
              controller: _fatherName,
              hint: 'اسم الأب',
              prefixIcon: Icons.badge_outlined,
              textInputAction: TextInputAction.next,
              validator: (v) => v == null || v.trim().isEmpty ? 'مطلوب' : null,
            ),
            const SizedBox(height: 12),
            AuthPillField(
              controller: _familyName,
              hint: 'اسم العائلة',
              prefixIcon: Icons.groups_outlined,
              textInputAction: TextInputAction.next,
              validator: (v) => v == null || v.trim().isEmpty ? 'مطلوب' : null,
            ),
            const SizedBox(height: 12),
            AuthPillField(
              controller: _email,
              hint: 'البريد الإلكتروني',
              prefixIcon: Icons.mail_outline_rounded,
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
              textDirection: TextDirection.ltr,
              validator: (v) => v == null || !v.contains('@') ? 'بريد غير صالح' : null,
            ),
            const SizedBox(height: 12),
            AuthPillField(
              controller: _phoneNumber,
              hint: 'رقم الجوال (بدون +962)',
              prefixIcon: Icons.phone_iphone_rounded,
              keyboardType: TextInputType.phone,
              textInputAction: TextInputAction.next,
              textDirection: TextDirection.ltr,
            ),
            const SizedBox(height: 12),
            AuthPillField(
              controller: _password,
              hint: 'كلمة المرور',
              prefixIcon: Icons.lock_outline_rounded,
              obscureText: _obscurePassword,
              textInputAction: TextInputAction.next,
              textDirection: TextDirection.ltr,
              suffix: IconButton(
                onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                icon: Icon(
                  _obscurePassword ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                  color: AppColors.textMuted,
                ),
              ),
              validator: (v) => v == null || v.length < 8 ? '8 أحرف على الأقل' : null,
            ),
            const SizedBox(height: 12),
            AuthPillField(
              controller: _confirmPassword,
              hint: 'تأكيد كلمة المرور',
              prefixIcon: Icons.lock_outline_rounded,
              obscureText: _obscureConfirm,
              textInputAction: TextInputAction.done,
              textDirection: TextDirection.ltr,
              onFieldSubmitted: (_) => _submit(),
              suffix: IconButton(
                onPressed: () => setState(() => _obscureConfirm = !_obscureConfirm),
                icon: Icon(
                  _obscureConfirm ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                  color: AppColors.textMuted,
                ),
              ),
              validator: (v) => v != _password.text ? 'غير مطابق' : null,
            ),
            const SizedBox(height: 28),
            AuthPrimaryButton(
              label: 'إنشاء حساب',
              isLoading: _submitting,
              onPressed: _submit,
            ),
            const SizedBox(height: 24),
            AuthFooterLink(
              prompt: 'لديك حساب بالفعل؟',
              actionLabel: 'تسجيل الدخول',
              onTap: () => context.go(AppRoutes.login),
            ),
          ],
        ),
      ),
    );
  }
}
