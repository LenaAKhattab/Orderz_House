import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import 'auth_controller.dart';
import 'auth_form_widgets.dart';

class OtpVerificationScreen extends ConsumerStatefulWidget {
  const OtpVerificationScreen({super.key, required this.email});

  final String email;

  @override
  ConsumerState<OtpVerificationScreen> createState() => _OtpVerificationScreenState();
}

class _OtpVerificationScreenState extends ConsumerState<OtpVerificationScreen> {
  String _otp = '';
  bool _submitting = false;
  String? _error;

  Future<void> _submit() async {
    final otp = _otp.trim();
    if (otp.length != 6) {
      setState(() => _error = 'أدخل رمز التحقق المكوّن من 6 أرقام.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).verifyOtp(
            email: widget.email,
            otp: otp,
          );
      if (!mounted) return;
      context.go(AppRoutes.home);
    } catch (e) {
      setState(() => _error = apiErrorMessage(e, fallback: 'رمز التحقق غير صحيح.'));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      showBack: true,
      onBack: () => context.go(AppRoutes.login),
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
          AuthOtpBoxes(
            length: 6,
            onChanged: (value) => setState(() => _otp = value),
          ),
          const SizedBox(height: 28),
          AuthPrimaryButton(
            label: 'تأكيد',
            isLoading: _submitting,
            onPressed: _submit,
          ),
          const SizedBox(height: 18),
          Text(
            'لم يصلك الرمز؟ تحقق من البريد الوارد أو مجلد الرسائل غير المرغوب فيها.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: AppColors.textMuted,
                  height: 1.5,
                ),
          ),
        ],
      ),
    );
  }
}
