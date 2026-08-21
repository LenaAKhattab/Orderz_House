import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/core/router/auth_redirect_policy.dart';
import 'package:orderzhouse_app/core/router/routes.dart';
import 'package:orderzhouse_app/features/auth/domain/auth_user.dart';
import 'package:orderzhouse_app/features/profile/domain/profile_actions.dart';

AuthUser _user({
  String role = 'client',
  List<String> roles = const [],
}) {
  return AuthUser(
    id: '1',
    email: 'user@test.com',
    firstName: 'Test',
    primaryRole: role,
    role: role,
    roles: roles,
  );
}

void main() {
  group('profile quick actions — client', () {
    test('includes my orders, create order, notifications, legal help', () {
      final actions = profileQuickActionsForUser(_user(role: 'client'));
      final ids = actions.map((a) => a.id).toSet();

      expect(ids, contains(ProfileActionId.myOrders));
      expect(ids, contains(ProfileActionId.createOrder));
      expect(ids, contains(ProfileActionId.notifications));
      expect(ids, contains(ProfileActionId.legalHelp));
      expect(ids, isNot(contains(ProfileActionId.financialClaims)));
    });

    test('create order route points to client create screen', () {
      final actions = profileQuickActionsForUser(_user(role: 'client'));
      final create = actions.firstWhere((a) => a.id == ProfileActionId.createOrder);
      expect(create.route, AppRoutes.clientCreateOrder);
    });

    test('notifications route exists for client', () {
      final actions = profileQuickActionsForUser(_user(role: 'client'));
      final notifications = actions.firstWhere((a) => a.id == ProfileActionId.notifications);
      expect(notifications.route, AppRoutes.notifications);
    });
  });

  group('profile quick actions — freelancer', () {
    test('includes freelancer orders, claims, activation, notifications, marketplace — no plans', () {
      final actions = profileQuickActionsForUser(_user(role: 'freelancer'));
      final ids = actions.map((a) => a.id).toSet();
      final labels = actions.map((a) => a.label).toList();

      expect(ids, contains(ProfileActionId.myOrders));
      expect(ids, contains(ProfileActionId.accountActivation));
      expect(ids, contains(ProfileActionId.miniArticles));
      expect(ids, contains(ProfileActionId.financialClaims));
      expect(ids, contains(ProfileActionId.notifications));
      expect(ids, contains(ProfileActionId.marketplace));
      expect(ids, isNot(contains(ProfileActionId.createOrder)));
      expect(labels, isNot(contains('الباقات')));
      expect(actions.any((a) => a.route == AppRoutes.freelancerPlans), isFalse);
      expect(
        actions.any((a) => a.route == AppRoutes.freelancerAccountActivation),
        isTrue,
      );
      expect(
        actions.any((a) => a.route == AppRoutes.freelancerMiniArticles),
        isTrue,
      );
    });

    test('financial claims route is freelancer path', () {
      final actions = profileQuickActionsForUser(_user(role: 'freelancer'));
      final claims = actions.firstWhere((a) => a.id == ProfileActionId.financialClaims);
      expect(claims.route, AppRoutes.freelancerFinancialClaims);
    });
  });

  group('profile action guards', () {
    test('create order not allowed for freelancer', () {
      expect(
        profileActionAllowedForUser(ProfileActionId.createOrder, _user(role: 'freelancer')),
        isFalse,
      );
    });

    test('financial claims not allowed for client', () {
      expect(
        profileActionAllowedForUser(ProfileActionId.financialClaims, _user(role: 'client')),
        isFalse,
      );
    });

    test('notifications allowed for both roles', () {
      expect(
        profileActionAllowedForUser(ProfileActionId.notifications, _user(role: 'client')),
        isTrue,
      );
      expect(
        profileActionAllowedForUser(ProfileActionId.notifications, _user(role: 'freelancer')),
        isTrue,
      );
    });
  });

  group('profile guest state', () {
    test('guest quick actions exclude marketplace browse CTA', () {
      final actions = profileGuestQuickActions();
      final ids = actions.map((a) => a.id).toSet();

      expect(ids, contains(ProfileActionId.login));
      expect(ids, contains(ProfileActionId.register));
      expect(ids, contains(ProfileActionId.legalHelp));
      expect(ids, isNot(contains(ProfileActionId.marketplace)));
      expect(ids, isNot(contains(ProfileActionId.createOrder)));
      expect(ids, isNot(contains(ProfileActionId.financialClaims)));
      expect(actions.any((a) => a.label.contains('تصفح السوق')), isFalse);
    });

    test('settings omit language placeholder', () {
      expect(profileSettingsItems().any((s) => s.label == 'اللغة'), isFalse);
    });

    test('unauthenticated /profile requires login redirect (auth-first)', () {
      expect(shouldRedirectUnauthenticatedToLogin(AppRoutes.profile), isTrue);
    });
  });

  group('profile role labels', () {
    test('maps roles to Arabic labels', () {
      expect(profileRoleLabelAr(_user(role: 'client')), 'عميل');
      expect(profileRoleLabelAr(_user(role: 'freelancer')), 'مستقل');
    });

    test('profileInitials uses display name', () {
      expect(profileInitials(_user(role: 'client')), 'T');
    });
  });

  group('logout confirmation', () {
    test('profile screen asks before logout and goes to login', () {
      final src = File('lib/features/profile/presentation/profile_screen.dart').readAsStringSync();
      expect(src, contains('هل تريد تسجيل الخروج؟'));
      expect(src, contains('_confirmLogout'));
      expect(src, contains('ref.invalidate(unreadNotificationsControllerProvider)'));
      expect(src, contains('context.go(AppRoutes.login)'));
      expect(src, isNot(contains('context.go(AppRoutes.home)')));
    });
  });
}
