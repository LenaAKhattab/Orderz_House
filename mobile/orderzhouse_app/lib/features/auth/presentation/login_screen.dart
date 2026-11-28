import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/router/auth_redirect_policy.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import 'auth_controller.dart';
import 'auth_form_widgets.dart';
import '../../../core/i18n/i18n.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.redirectLocation});

  final String? redirectLocation;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).login(
            email: _emailController.text,
            password: _passwordController.text,
          );
      if (!mounted) return;
      final redirect = sanitizeLoginRedirect(widget.redirectLocation);
      context.go(redirect ?? AppRoutes.home);
    } catch (e) {
      setState(() => _error = apiErrorMessage(e, fallback: tr('تعذر تسجيل الدخول.')));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      child: Form(
        key: _formKey,
        child: LayoutBuilder(
          builder: (context, constraints) {
            return SingleChildScrollView(
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(24, 28, 24, 28),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      AuthHeroHeader(
                        title: tr('تسجيل الدخول'),
                        subtitle: tr('أدخل بريدك وكلمة المرور للمتابعة إلى حسابك.'),
                      ),
                      const SizedBox(height: 32),
                      if (_error != null) ...[
                        OhErrorBanner(message: _error!),
                        const SizedBox(height: 14),
                      ],
                      AuthPillField(
                        controller: _emailController,
                        hint: tr('البريد الإلكتروني'),
                        prefixIcon: Icons.mail_outline_rounded,
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                        textDirection: TextDirection.ltr,
                        validator: (v) {
                          if (v == null || v.trim().isEmpty) return tr('البريد الإلكتروني مطلوب.');
                          if (!v.contains('@')) return tr('صيغة البريد غير صالحة.');
                          return null;
                        },
                      ),
                      const SizedBox(height: 14),
                      AuthPillField(
                        controller: _passwordController,
                        hint: tr('كلمة المرور'),
                        prefixIcon: Icons.lock_outline_rounded,
                        obscureText: _obscurePassword,
                        textInputAction: TextInputAction.done,
                        textDirection: TextDirection.ltr,
                        onFieldSubmitted: (_) => _submit(),
                        suffix: IconButton(
                          onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                          icon: Icon(
                            _obscurePassword ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                            color: AppColors.textMuted,
                          ),
                        ),
                        validator: (v) {
                          if (v == null || v.isEmpty) return tr('كلمة المرور مطلوبة.');
                          return null;
                        },
                      ),
                      const SizedBox(height: 8),
                      Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: TextButton(
                          onPressed: () => context.push(AppRoutes.forgotPassword),
                          child: Text(tr('هل نسيت كلمة المرور؟')),
                        ),
                      ),
                      const SizedBox(height: 16),
                      AuthPrimaryButton(
                        label: tr('تسجيل الدخول'),
                        isLoading: _submitting,
                        onPressed: _submit,
                      ),
                      const SizedBox(height: 28),
                      AuthFooterLink(
                        prompt: tr('ليس لديك حساب؟'),
                        actionLabel: tr('إنشاء حساب'),
                        onTap: () => context.push(AppRoutes.register),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
