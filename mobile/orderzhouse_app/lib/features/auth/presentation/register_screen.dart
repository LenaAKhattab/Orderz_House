import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../domain/register_payload.dart';
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
  String _accountType = PublicSignupAccountType.client;
  final Set<String> _categories = {};

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

  void _selectAccountType(String type) {
    if (!PublicSignupAccountType.allowed.contains(type)) return;
    setState(() {
      _accountType = type;
      if (type != PublicSignupAccountType.freelancer) {
        _categories.clear();
      }
      _error = null;
    });
  }

  void _toggleCategory(String slug) {
    setState(() {
      if (_categories.contains(slug)) {
        _categories.remove(slug);
      } else {
        _categories.add(slug);
      }
    });
  }

  Future<void> _submit() async {
    final typeError = validatePublicAccountType(_accountType);
    if (typeError != null) {
      setState(() => _error = typeError);
      return;
    }
    final categoryError = validateFreelancerCategories(
      accountType: _accountType,
      categories: _categories,
    );
    if (categoryError != null) {
      setState(() => _error = categoryError);
      return;
    }
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final body = buildRegisterRequestBody(
        firstName: _firstName.text,
        fatherName: _fatherName.text,
        familyName: _familyName.text,
        email: _email.text,
        password: _password.text,
        confirmPassword: _confirmPassword.text,
        accountType: _accountType,
        phoneNumber: _phoneNumber.text,
        categories: _categories.toList(),
      );
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
    final isFreelancer = _accountType == PublicSignupAccountType.freelancer;
    return AuthScaffold(
      showBack: true,
      child: Form(
        key: _formKey,
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 28),
          children: [
            const AuthHeroHeader(
              title: 'إنشاء حساب',
              subtitle: 'اختر نوع الحساب ثم أدخل بياناتك وأكّد بريدك برمز التحقق.',
              showLogo: false,
            ),
            const SizedBox(height: 20),
            const Text(
              'نوع الحساب',
              key: Key('register_account_type_label'),
              textAlign: TextAlign.right,
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 15,
                color: AppColors.textInk,
              ),
            ),
            const SizedBox(height: 10),
            Wrap(
              key: const Key('register_account_type_selector'),
              spacing: 10,
              runSpacing: 10,
              alignment: WrapAlignment.end,
              children: [
                _AccountTypeChip(
                  key: const Key('register_account_type_client'),
                  label: 'عميل',
                  selected: _accountType == PublicSignupAccountType.client,
                  onTap: () => _selectAccountType(PublicSignupAccountType.client),
                ),
                _AccountTypeChip(
                  key: const Key('register_account_type_freelancer'),
                  label: 'مستقل',
                  selected: _accountType == PublicSignupAccountType.freelancer,
                  onTap: () => _selectAccountType(PublicSignupAccountType.freelancer),
                ),
              ],
            ),
            if (isFreelancer) ...[
              const SizedBox(height: 16),
              const Text(
                'التخصصات',
                textAlign: TextAlign.right,
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 15,
                  color: AppColors.textInk,
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                alignment: WrapAlignment.end,
                children: [
                  for (final slug in FreelancerSignupCategory.slugs)
                    _AccountTypeChip(
                      key: Key('register_category_$slug'),
                      label: FreelancerSignupCategory.labelsAr[slug] ?? slug,
                      selected: _categories.contains(slug),
                      onTap: () => _toggleCategory(slug),
                    ),
                ],
              ),
            ],
            const SizedBox(height: 20),
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
              validator: validateRegisterPassword,
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

class _AccountTypeChip extends StatelessWidget {
  const _AccountTypeChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.primary : AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(22),
        side: BorderSide(
          color: selected ? AppColors.primary : AppColors.primaryMid,
          width: 1.4,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(22),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
          child: Text(
            label,
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 15,
              color: selected ? Colors.white : AppColors.primaryDeep,
            ),
          ),
        ),
      ),
    );
  }
}
