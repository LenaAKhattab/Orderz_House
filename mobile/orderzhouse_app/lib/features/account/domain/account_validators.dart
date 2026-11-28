import '../../../core/i18n/i18n.dart';
/// Client-side password rules (aligned with backend changePasswordForUser).
class PasswordRules {
  PasswordRules._();

  static const minLength = 8;
  static final _letterAndDigit = RegExp(r'(?=.*[a-zA-Z])(?=.*\d)');

  static String? validateNewPassword(String? value) {
    final p = value ?? '';
    if (p.isEmpty) return tr('أدخل كلمة المرور الجديدة.');
    if (p.length < minLength) return tr('كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.');
    if (!_letterAndDigit.hasMatch(p)) {
      return tr('كلمة المرور يجب أن تحتوي على حرف ورقم على الأقل.');
    }
    return null;
  }

  static String? validateConfirm(String? password, String? confirm) {
    if ((confirm ?? '').isEmpty) return tr('أكد كلمة المرور الجديدة.');
    if (password != confirm) return tr('كلمتا المرور غير متطابقتين.');
    return null;
  }

  static String? validateCurrent(String? value) {
    if ((value ?? '').isEmpty) return tr('أدخل كلمة المرور الحالية.');
    return null;
  }
}

/// Delete-account confirmation phrase (must match backend).
bool isDeleteAccountConfirmationValid(String? raw) {
  final conf = (raw ?? '').trim();
  return conf == 'حذف' || conf.toUpperCase() == 'DELETE';
}
