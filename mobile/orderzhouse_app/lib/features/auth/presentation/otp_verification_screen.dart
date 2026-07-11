import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import 'auth_controller.dart';

class OtpVerificationScreen extends ConsumerStatefulWidget {
  const OtpVerificationScreen({super.key, required this.email});

  final String email;

  @override
  ConsumerState<OtpVerificationScreen> createState() => _OtpVerificationScreenState();
}

class _OtpVerificationScreenState extends ConsumerState<OtpVerificationScreen> {
  final _otpController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _otpController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final otp = _otpController.text.trim();
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
    return Scaffold(
      appBar: AppBar(title: const Text('تأكيد البريد')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          OhCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'أدخل رمز التحقق',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: AppColors.textInk,
                      ),
                  textAlign: TextAlign.right,
                ),
                const SizedBox(height: 8),
                Text(
                  'أرسلنا رمزاً إلى ${widget.email}',
                  textAlign: TextAlign.right,
                  style: const TextStyle(color: AppColors.textMuted, height: 1.6),
                ),
                const SizedBox(height: 16),
                if (_error != null) ...[
                  OhErrorBanner(message: _error!),
                  const SizedBox(height: 12),
                ],
                TextFormField(
                  controller: _otpController,
                  keyboardType: TextInputType.number,
                  textAlign: TextAlign.center,
                  maxLength: 6,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: const InputDecoration(
                    labelText: 'رمز التحقق',
                    counterText: '',
                  ),
                ),
                const SizedBox(height: 20),
                OhButton(label: 'تأكيد', isLoading: _submitting, onPressed: _submit),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
