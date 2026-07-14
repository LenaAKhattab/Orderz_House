import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/core/router/routes.dart';
import 'package:orderzhouse_app/features/account/domain/account_validators.dart';
import 'package:orderzhouse_app/features/profile/domain/profile_actions.dart';

void main() {
  group('account management entry', () {
    test('profile shows إعدادات الحساب in account management section', () {
      final items = profileAccountManagementItems();
      expect(items, isNotEmpty);
      expect(items.first.id, ProfileSettingsId.accountSettings);
      expect(items.first.label, 'إعدادات الحساب');
      expect(items.first.route, AppRoutes.accountSettings);
    });

    test('general settings do not include plans/subscriptions', () {
      final settings = profileSettingsItems(isAuthenticated: true);
      final labels = settings.map((s) => s.label).join(' ');
      expect(labels.contains('باقات'), isFalse);
      expect(labels.contains('اشتراك'), isFalse);
      expect(labels.toLowerCase().contains('stripe'), isFalse);
      expect(settings.any((s) => s.id == ProfileSettingsId.accountSettings), isFalse);
    });
  });

  group('password validation', () {
    test('rejects short and weak passwords', () {
      expect(PasswordRules.validateNewPassword(''), isNotNull);
      expect(PasswordRules.validateNewPassword('short1'), isNotNull);
      expect(PasswordRules.validateNewPassword('password'), isNotNull);
      expect(PasswordRules.validateNewPassword('12345678'), isNotNull);
    });

    test('accepts strong enough password and matching confirm', () {
      expect(PasswordRules.validateNewPassword('Password1'), isNull);
      expect(PasswordRules.validateConfirm('Password1', 'Password1'), isNull);
      expect(PasswordRules.validateConfirm('Password1', 'Password2'), isNotNull);
      expect(PasswordRules.validateCurrent(''), isNotNull);
      expect(PasswordRules.validateCurrent('x'), isNull);
    });
  });

  group('delete account confirmation', () {
    test('requires حذف or DELETE before API call is considered valid', () {
      expect(isDeleteAccountConfirmationValid(''), isFalse);
      expect(isDeleteAccountConfirmationValid('نعم'), isFalse);
      expect(isDeleteAccountConfirmationValid('حذف'), isTrue);
      expect(isDeleteAccountConfirmationValid('DELETE'), isTrue);
    });

    test('delete account screen asks for password and confirmation phrase', () {
      final src = File(
        'lib/features/account/presentation/delete_account_screen.dart',
      ).readAsStringSync();
      expect(src, contains('اكتب «حذف» للتأكيد'));
      expect(src, contains('كلمة المرور الحالية'));
      expect(src, contains('تأكيد نهائي'));
      expect(src, contains('deactivateAccount'));
      expect(src, contains('سيتم تعطيل حسابك'));
      expect(src, contains('البيانات الشخصية'));
      expect(src, isNot(contains('الباقات')));
      expect(src, isNot(contains('Stripe')));
    });
  });

  group('account settings screen contents', () {
    test('includes profile edit, password, delete, logout — no plans', () {
      final src = File(
        'lib/features/account/presentation/account_settings_screen.dart',
      ).readAsStringSync();
      expect(src, contains('تعديل الملف الشخصي'));
      expect(src, contains('تغيير كلمة المرور'));
      expect(src, contains('حذف الحساب'));
      expect(src, contains('تسجيل الخروج'));
      expect(src, isNot(contains('الباقات')));
      expect(src, isNot(contains('اشتراك')));
      expect(src, isNot(contains('Stripe')));
    });
  });

  group('logout still present on profile', () {
    test('profile screen keeps logout confirmation and account management', () {
      final src = File('lib/features/profile/presentation/profile_screen.dart').readAsStringSync();
      expect(src, contains('هل تريد تسجيل الخروج؟'));
      expect(src, contains('_confirmLogout'));
      expect(src, contains('إدارة الحساب'));
      expect(src, contains('profileAccountManagementItems'));
      expect(src, contains('accountManagement'));
    });
  });
}
