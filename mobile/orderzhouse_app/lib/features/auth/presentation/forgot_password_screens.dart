import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/router/routes.dart';
import '../../../core/widgets/oh_widgets.dart';
import 'auth_controller.dart';
import 'auth_form_widgets.dart';

class ForgotPasswordEmailScreen extends ConsumerStatefulWidget {
  const ForgotPasswordEmailScreen({super.key});

  @override
  ConsumerState<ForgotPasswordEmailScreen> createState() => _ForgotPasswordEmailScreenState();
}

class _ForgotPasswordEmailScreenState extends ConsumerState<ForgotPasswordEmailScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).requestForgotPasswordOtp(_email.text);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم إرسال رمز التحقق')),
      );
      context.push(
        '${AppRoutes.forgotPasswordOtp}?email=${Uri.encodeComponent(_email.text.trim())}',
      );
    } catch (e) {
      setState(() {
        _error = apiErrorMessage(e, fallback: 'البريد غير موجود أو لا يمكن تنفيذ العملية');
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      showBack: true,
      onBack: () => context.go(AppRoutes.login),
      child: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 28),
          children: [
            const AuthHeroHeader(
              title: 'نسيت كلمة المرور؟',
              subtitle: 'أدخل بريدك الإلكتروني لإرسال رمز التحقق.',
            ),
            const SizedBox(height: 32),
            if (_error != null) ...[
              OhErrorBanner(message: _error!),
              const SizedBox(height: 14),
            ],
            AuthPillField(
              controller: _email,
              hint: 'البريد الإلكتروني',
              prefixIcon: Icons.mail_outline_rounded,
              keyboardType: TextInputType.emailAddress,
              textDirection: TextDirection.ltr,
              validator: (v) {
                if (v == null || v.trim().isEmpty) return 'البريد الإلكتروني مطلوب.';
                if (!v.contains('@')) return 'صيغة البريد غير صالحة.';
                return null;
              },
            ),
            const SizedBox(height: 28),
            AuthPrimaryButton(
              label: 'إرسال الرمز',
              isLoading: _submitting,
              onPressed: _submit,
            ),
          ],
        ),
      ),
    );
  }
}

class ForgotPasswordOtpScreen extends ConsumerStatefulWidget {
  const ForgotPasswordOtpScreen({super.key, required this.email});

  final String email;

  @override
  ConsumerState<ForgotPasswordOtpScreen> createState() => _ForgotPasswordOtpScreenState();
}

class _ForgotPasswordOtpScreenState extends ConsumerState<ForgotPasswordOtpScreen> {
  String _otp = '';
  bool _submitting = false;
  String? _error;

  Future<void> _submit() async {
    if (_otp.trim().length != 6) {
      setState(() => _error = 'أدخل رمز التحقق المكوّن من 6 أرقام.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final token = await ref.read(authControllerProvider.notifier).verifyForgotPasswordOtp(
            email: widget.email,
            otp: _otp,
          );
      if (!mounted) return;
      context.push(
        AppRoutes.forgotPasswordReset,
        extra: {'email': widget.email, 'resetToken': token},
      );
    } catch (e) {
      setState(() => _error = apiErrorMessage(e, fallback: 'الرمز غير صحيح'));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      showBack: true,
      onBack: () => context.go(AppRoutes.forgotPassword),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 28),
        children: [
          AuthHeroHeader(
            title: 'أدخل رمز التحقق',
            subtitle: 'أرسلنا رمزًا مكوّنًا من 6 أرقام إلى\n${widget.email}',
          ),
          const SizedBox(height: 32),
          if (_error != null) ...[
            OhErrorBanner(message: _error!),
            const SizedBox(height: 14),
          ],
          AuthOtpBoxes(length: 6, onChanged: (value) => setState(() => _otp = value)),
          const SizedBox(height: 28),
          AuthPrimaryButton(
            label: 'تأكيد الرمز',
            isLoading: _submitting,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}

class ForgotPasswordResetScreen extends ConsumerStatefulWidget {
  const ForgotPasswordResetScreen({
    super.key,
    required this.email,
    required this.resetToken,
  });

  final String email;
  final String resetToken;

  @override
  ConsumerState<ForgotPasswordResetScreen> createState() => _ForgotPasswordResetScreenState();
}

class _ForgotPasswordResetScreenState extends ConsumerState<ForgotPasswordResetScreen> {
  final _formKey = GlobalKey<FormState>();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _obscure = true;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (widget.resetToken.isEmpty) {
      setState(() => _error = 'رمز إعادة التعيين غير صالح. أعد المحاولة.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).resetPassword(
            email: widget.email,
            resetToken: widget.resetToken,
            newPassword: _password.text,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم تغيير كلمة المرور بنجاح')),
      );
      context.go(AppRoutes.login);
    } catch (e) {
      setState(() => _error = apiErrorMessage(e, fallback: 'البريد غير موجود أو لا يمكن تنفيذ العملية'));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      showBack: true,
      onBack: () => context.go(AppRoutes.forgotPassword),
      child: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 28),
          children: [
            const AuthHeroHeader(
              title: 'كلمة مرور جديدة',
              subtitle: 'اختر كلمة مرور تحتوي حرفاً إنجليزياً ورقماً، وطولها 8 أحرف على الأقل.',
            ),
            const SizedBox(height: 32),
            if (_error != null) ...[
              OhErrorBanner(message: _error!),
              const SizedBox(height: 14),
            ],
            AuthPillField(
              controller: _password,
              hint: 'كلمة المرور الجديدة',
              prefixIcon: Icons.lock_outline_rounded,
              obscureText: _obscure,
              textDirection: TextDirection.ltr,
              validator: (v) {
                final value = v ?? '';
                if (value.length < 8) return 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.';
                if (!RegExp(r'[A-Za-z]').hasMatch(value) || !RegExp(r'[0-9]').hasMatch(value)) {
                  return 'يجب أن تحتوي حرفاً إنجليزياً ورقماً.';
                }
                return null;
              },
            ),
            const SizedBox(height: 14),
            AuthPillField(
              controller: _confirm,
              hint: 'تأكيد كلمة المرور',
              prefixIcon: Icons.lock_outline_rounded,
              obscureText: _obscure,
              textDirection: TextDirection.ltr,
              suffix: IconButton(
                onPressed: () => setState(() => _obscure = !_obscure),
                icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined),
              ),
              validator: (v) {
                if (v != _password.text) return 'كلمتا المرور غير متطابقتين.';
                return null;
              },
            ),
            const SizedBox(height: 28),
            AuthPrimaryButton(
              label: 'حفظ كلمة المرور',
              isLoading: _submitting,
              onPressed: _submit,
            ),
          ],
        ),
      ),
    );
  }
}
