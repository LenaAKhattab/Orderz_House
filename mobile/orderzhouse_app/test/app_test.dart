import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/core/theme/app_colors.dart';
import 'package:orderzhouse_app/features/auth/domain/auth_user.dart';

void main() {
  test('AuthUser parses backend user json', () {
    final user = AuthUser.fromJson({
      'id': '12',
      'email': 'client@example.com',
      'firstName': 'أحمد',
      'fatherName': 'علي',
      'familyName': 'حسن',
      'primaryRole': 'client',
      'roles': ['client'],
    });

    expect(user.id, '12');
    expect(user.displayName, 'أحمد علي حسن');
    expect(user.effectiveRole, 'client');
    expect(user.isClientAccount, isTrue);
    expect(user.isFreelancerAccount, isFalse);
  });

  test('design tokens primary color matches web', () {
    expect(AppColors.primary.toARGB32(), 0xFF2F3B65);
    expect(AppColors.secondary.toARGB32(), 0xFF76CFDF);
  });
}
