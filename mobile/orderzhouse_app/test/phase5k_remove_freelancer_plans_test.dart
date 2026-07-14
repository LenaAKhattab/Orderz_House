import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/core/router/routes.dart';
import 'package:orderzhouse_app/features/auth/domain/auth_user.dart';
import 'package:orderzhouse_app/features/freelancer/data/freelancer_eligibility_models.dart';
import 'package:orderzhouse_app/features/profile/domain/profile_actions.dart';

void main() {
  group('Phase 5K — remove freelancer plans from Flutter (Play compliance)', () {
    test('freelancer profile actions exclude plans / subscription', () {
      final actions = profileQuickActionsForUser(
        const AuthUser(
          id: '1',
          email: 'f@test.com',
          primaryRole: 'freelancer',
          role: 'freelancer',
        ),
      );
      expect(actions.any((a) => a.route == AppRoutes.freelancerPlans), isFalse);
      expect(actions.any((a) => a.label.contains('باق')), isFalse);
      expect(actions.any((a) => a.label.contains('اشتراك')), isFalse);
    });

    test('eligibility ineligible copy has no plans CTA language', () {
      const eligibility = FreelancerEligibility(eligible: false, reason: 'no_subscription');
      final msg = freelancerEligibilityMessageAr(eligibility);
      expect(msg, contains('مراجعة الإدارة'));
      expect(msg.toLowerCase(), isNot(contains('باقات')));
      expect(msg, isNot(contains('اشترك')));
      expect(msg, isNot(contains('ترقية')));
    });

    test('UI sources do not navigate to freelancer plans or open web subscription', () {
      final files = [
        'lib/features/profile/domain/profile_actions.dart',
        'lib/features/profile/presentation/profile_screen.dart',
        'lib/features/freelancer/presentation/freelancer_home_screen.dart',
        'lib/features/freelancer/presentation/freelancer_eligibility_banner.dart',
        'lib/features/orders/presentation/pool_order_detail_screen.dart',
      ];
      for (final path in files) {
        final src = File(path).readAsStringSync();
        expect(src, isNot(contains('AppRoutes.freelancerPlans')), reason: path);
        expect(src, isNot(contains('launchFreelancerPlansOnWeb')), reason: path);
        expect(src, isNot(contains('عرض الباقات')), reason: path);
        expect(src, isNot(contains('إكمال الاشتراك')), reason: path);
      }
    });

    test('router redirects /freelancer/plans to profile', () {
      final src = File('lib/core/router/app_router.dart').readAsStringSync();
      expect(src, contains('path: AppRoutes.freelancerPlans'));
      expect(src, contains('redirect: (context, state) => AppRoutes.profile'));
      expect(src, isNot(contains('FreelancerPlansScreen')));
    });

    test('live UI does not watch freelancerPlansControllerProvider', () {
      final files = <File>[
        ...Directory('lib/features/shell').listSync(recursive: true).whereType<File>(),
        ...Directory('lib/features/home').listSync(recursive: true).whereType<File>(),
        ...Directory('lib/features/profile').listSync(recursive: true).whereType<File>(),
        ...Directory('lib/features/orders').listSync(recursive: true).whereType<File>(),
        File('lib/features/freelancer/presentation/freelancer_home_screen.dart'),
        File('lib/features/freelancer/presentation/freelancer_eligibility_banner.dart'),
        File('lib/features/freelancer/presentation/freelancer_order_detail_screen.dart'),
      ];
      for (final file in files) {
        if (!file.path.endsWith('.dart')) continue;
        if (file.path.contains('freelancer_plans')) continue;
        final src = file.readAsStringSync();
        expect(src, isNot(contains('freelancerPlansControllerProvider')), reason: file.path);
        expect(src, isNot(contains('fetchPlansSnapshot')), reason: file.path);
      }
    });
  });
}
