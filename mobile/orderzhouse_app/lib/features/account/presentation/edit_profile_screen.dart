import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/account_models.dart';
import '../data/account_repository.dart';
import 'account_settings_screen.dart';

class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key});

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  final _firstName = TextEditingController();
  final _fatherName = TextEditingController();
  final _familyName = TextEditingController();
  final _phone = TextEditingController();
  final _whatsApp = TextEditingController();
  final _professionalTitle = TextEditingController();
  final _bio = TextEditingController();
  final _companyName = TextEditingController();
  final _billingCity = TextEditingController();
  final _billingCountry = TextEditingController();

  bool _loading = true;
  bool _saving = false;
  String? _loadError;
  AccountProfile? _profile;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _firstName.dispose();
    _fatherName.dispose();
    _familyName.dispose();
    _phone.dispose();
    _whatsApp.dispose();
    _professionalTitle.dispose();
    _bio.dispose();
    _companyName.dispose();
    _billingCity.dispose();
    _billingCountry.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final profile = await ref.read(accountRepositoryProvider).getProfile();
      if (!mounted) return;
      _applyProfile(profile);
      setState(() {
        _profile = profile;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = apiErrorMessage(e, fallback: 'تعذر تحميل الملف الشخصي.');
      });
    }
  }

  void _applyProfile(AccountProfile p) {
    _firstName.text = p.firstName ?? '';
    _fatherName.text = p.fatherName ?? '';
    _familyName.text = p.familyName ?? '';
    _phone.text = p.phone ?? '';
    _whatsApp.text = p.whatsApp ?? '';
    _professionalTitle.text = p.professionalTitle ?? '';
    _bio.text = p.bio ?? '';
    _companyName.text = p.companyName ?? '';
    _billingCity.text = p.billingCity ?? '';
    _billingCountry.text = p.billingCountry ?? '';
  }

  String? _requiredName(String? v) {
    if ((v ?? '').trim().length < 2) return 'أدخل اسماً صالحاً (حرفان على الأقل).';
    return null;
  }

  String? _optionalE164(String? v) {
    final t = (v ?? '').trim();
    if (t.isEmpty) return null;
    if (!RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(t)) {
      return 'استخدم صيغة دولية مثل +9627xxxxxxxx';
    }
    return null;
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate() || _saving) return;
    setState(() => _saving = true);
    try {
      final profile = _profile;
      final payload = ProfileUpdatePayload(
        firstName: _firstName.text,
        fatherName: _fatherName.text,
        familyName: _familyName.text,
        phone: _phone.text,
        whatsApp: _whatsApp.text,
        professionalTitle: profile?.isFreelancer == true ? _professionalTitle.text : null,
        bio: profile?.isFreelancer == true ? _bio.text : null,
        companyName: profile?.isClient == true ? _companyName.text : null,
        billingCity: profile?.isClient == true ? _billingCity.text : null,
        billingCountry: profile?.isClient == true ? _billingCountry.text : null,
      );
      final updated = await ref.read(accountRepositoryProvider).updateProfile(payload);
      await ref.read(authControllerProvider.notifier).refreshSessionUser();
      ref.invalidate(accountProfileProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم تحديث الملف الشخصي بنجاح')),
      );
      context.pop(updated);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(apiErrorMessage(e, fallback: 'تعذر حفظ التغييرات.'))),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(title: const Text('تعديل الملف الشخصي')),
      body: _loading
          ? const OhLoadingBody(message: 'جاري التحميل...')
          : _loadError != null
              ? OhErrorBody(message: _loadError!, onRetry: _load)
              : Form(
                  key: _formKey,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                    children: [
                      _field(
                        controller: _firstName,
                        label: 'الاسم الأول',
                        validator: _requiredName,
                      ),
                      _field(
                        controller: _fatherName,
                        label: 'اسم الأب',
                        validator: _requiredName,
                      ),
                      _field(
                        controller: _familyName,
                        label: 'اسم العائلة',
                        validator: _requiredName,
                      ),
                      const SizedBox(height: 8),
                      TextFormField(
                        initialValue: _profile?.email ?? '',
                        enabled: false,
                        decoration: const InputDecoration(
                          labelText: 'البريد الإلكتروني',
                          helperText: 'لا يمكن تغيير البريد من التطبيق.',
                        ),
                      ),
                      const SizedBox(height: 12),
                      _field(
                        controller: _phone,
                        label: 'رقم الهاتف',
                        keyboardType: TextInputType.phone,
                        validator: _optionalE164,
                        helperText: 'اختياري — بصيغة دولية (+962...)',
                      ),
                      _field(
                        controller: _whatsApp,
                        label: 'واتساب',
                        keyboardType: TextInputType.phone,
                        validator: _optionalE164,
                        helperText: 'اختياري — بصيغة دولية',
                      ),
                      if (_profile?.isFreelancer == true) ...[
                        const SizedBox(height: 8),
                        _field(controller: _professionalTitle, label: 'المسمى المهني'),
                        _field(
                          controller: _bio,
                          label: 'نبذة',
                          maxLines: 4,
                        ),
                      ],
                      if (_profile?.isClient == true) ...[
                        const SizedBox(height: 8),
                        _field(controller: _companyName, label: 'اسم الشركة'),
                        _field(controller: _billingCity, label: 'مدينة الفوترة'),
                        _field(
                          controller: _billingCountry,
                          label: 'بلد الفوترة (رمز ISO مثل JO)',
                        ),
                      ],
                      const SizedBox(height: 20),
                      FilledButton(
                        onPressed: _saving ? null : _save,
                        child: Text(_saving ? 'جاري الحفظ...' : 'حفظ التغييرات'),
                      ),
                    ],
                  ),
                ),
    );
  }

  Widget _field({
    required TextEditingController controller,
    required String label,
    String? Function(String?)? validator,
    TextInputType? keyboardType,
    int maxLines = 1,
    String? helperText,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        controller: controller,
        validator: validator,
        keyboardType: keyboardType,
        maxLines: maxLines,
        decoration: InputDecoration(labelText: label, helperText: helperText),
      ),
    );
  }
}
