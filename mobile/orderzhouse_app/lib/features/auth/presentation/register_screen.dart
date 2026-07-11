import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import 'auth_controller.dart';

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
    return Scaffold(
      appBar: AppBar(title: const Text('إنشاء حساب')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'حساب عميل جديد',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.textInk,
                ),
            textAlign: TextAlign.right,
          ),
          const SizedBox(height: 8),
          const Text(
            'أدخل بياناتك بالعربية ثم أكّد بريدك برمز التحقق.',
            textAlign: TextAlign.right,
            style: TextStyle(color: AppColors.textMuted, height: 1.6),
          ),
          const SizedBox(height: 16),
          OhCard(
            child: Form(
              key: _formKey,
              child: Column(
                children: [
                  if (_error != null) ...[
                    OhErrorBanner(message: _error!),
                    const SizedBox(height: 12),
                  ],
                  OhTextField(
                    controller: _firstName,
                    label: 'الاسم الأول',
                    validator: (v) => v == null || v.trim().isEmpty ? 'مطلوب' : null,
                  ),
                  const SizedBox(height: 12),
                  OhTextField(
                    controller: _fatherName,
                    label: 'اسم الأب',
                    validator: (v) => v == null || v.trim().isEmpty ? 'مطلوب' : null,
                  ),
                  const SizedBox(height: 12),
                  OhTextField(
                    controller: _familyName,
                    label: 'اسم العائلة',
                    validator: (v) => v == null || v.trim().isEmpty ? 'مطلوب' : null,
                  ),
                  const SizedBox(height: 12),
                  OhTextField(
                    controller: _email,
                    label: 'البريد الإلكتروني',
                    keyboardType: TextInputType.emailAddress,
                    validator: (v) => v == null || !v.contains('@') ? 'بريد غير صالح' : null,
                  ),
                  const SizedBox(height: 12),
                  OhTextField(
                    controller: _phoneNumber,
                    label: 'رقم الجوال (بدون +962)',
                    keyboardType: TextInputType.phone,
                  ),
                  const SizedBox(height: 12),
                  OhTextField(
                    controller: _password,
                    label: 'كلمة المرور',
                    obscureText: true,
                    validator: (v) => v == null || v.length < 8 ? '8 أحرف على الأقل' : null,
                  ),
                  const SizedBox(height: 12),
                  OhTextField(
                    controller: _confirmPassword,
                    label: 'تأكيد كلمة المرور',
                    obscureText: true,
                    validator: (v) => v != _password.text ? 'غير مطابق' : null,
                  ),
                  const SizedBox(height: 20),
                  OhButton(label: 'متابعة', isLoading: _submitting, onPressed: _submit),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
