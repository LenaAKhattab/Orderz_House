import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/features/auth/domain/auth_user.dart';
import 'package:orderzhouse_app/features/auth/domain/register_payload.dart';
import 'package:orderzhouse_app/features/auth/presentation/register_screen.dart';
import 'package:orderzhouse_app/features/pantry/data/pantry_models.dart';
import 'package:orderzhouse_app/features/pantry/presentation/pantry_display.dart';

AuthUser _user({required String role}) {
  return AuthUser(
    id: '1',
    email: 'qa+$role@example.com',
    firstName: 'QA',
    primaryRole: role,
    role: role,
    roles: [role],
  );
}

void main() {
  group('register payload', () {
    test('client payload sends client accountType and no categories', () {
      final body = buildRegisterRequestBody(
        firstName: 'أ',
        fatherName: 'ب',
        familyName: 'ج',
        email: 'qa-client@example.com',
        password: 'Password1',
        confirmPassword: 'Password1',
        accountType: PublicSignupAccountType.client,
        phoneNumber: '790000001',
        categories: ['design'],
      );
      expect(body['accountType'], 'client');
      expect(body.containsKey('categories'), isFalse);
      expect(body.containsKey('role'), isFalse);
      expect(body['accountType'], isNot('merchant'));
    });

    test('freelancer payload includes freelancer role and categories', () {
      final body = buildRegisterRequestBody(
        firstName: 'أ',
        fatherName: 'ب',
        familyName: 'ج',
        email: 'qa-freelancer@example.com',
        password: 'Password1',
        confirmPassword: 'Password1',
        accountType: PublicSignupAccountType.freelancer,
        phoneNumber: '790000002',
        categories: ['design', 'merchant', 'admin'],
      );
      expect(body['accountType'], 'freelancer');
      expect(body['categories'], ['design']);
      expect(body.containsKey('role'), isFalse);
    });

    test('merchant and admin are not public signup types', () {
      expect(PublicSignupAccountType.allowed, equals({'client', 'freelancer'}));
      expect(PublicSignupAccountType.blocked, contains('merchant'));
      expect(PublicSignupAccountType.blocked, contains('admin'));
      expect(PublicSignupAccountType.blocked, contains('super_admin'));
      expect(PublicSignupAccountType.blocked, contains('program_admin'));
      expect(
        () => buildRegisterRequestBody(
          firstName: 'أ',
          fatherName: 'ب',
          familyName: 'ج',
          email: 'x@example.com',
          password: 'Password1',
          confirmPassword: 'Password1',
          accountType: 'merchant',
          phoneNumber: '790000003',
        ),
        throwsArgumentError,
      );
    });

    test('freelancer requires at least one category', () {
      expect(
        validateFreelancerCategories(accountType: 'freelancer', categories: []),
        isNotNull,
      );
      expect(
        validateFreelancerCategories(accountType: 'freelancer', categories: ['design']),
        isNull,
      );
      expect(
        validateFreelancerCategories(accountType: 'client', categories: []),
        isNull,
      );
    });
  });

  group('register screen UI', () {
    testWidgets('shows Client and Freelancer options', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: RegisterScreen(),
            ),
          ),
        ),
      );
      expect(find.byKey(const Key('register_account_type_selector')), findsOneWidget);
      expect(find.byKey(const Key('register_account_type_client')), findsOneWidget);
      expect(find.byKey(const Key('register_account_type_freelancer')), findsOneWidget);
      expect(find.text('عميل'), findsOneWidget);
      expect(find.text('مستقل'), findsOneWidget);
      expect(find.text('تاجر'), findsNothing);
      expect(find.text('مدير'), findsNothing);
      expect(find.text('مشرف'), findsNothing);
    });

    testWidgets('selecting Freelancer updates state and shows categories', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(home: RegisterScreen()),
        ),
      );
      await tester.tap(find.byKey(const Key('register_account_type_freelancer')));
      await tester.pump();
      expect(find.byKey(const Key('register_category_design')), findsOneWidget);
      expect(find.text('تصميم'), findsOneWidget);
    });

    testWidgets('RTL small screen does not hide role selector', (tester) async {
      tester.view.physicalSize = const Size(320, 568);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: RegisterScreen(),
            ),
          ),
        ),
      );
      expect(find.byKey(const Key('register_account_type_freelancer')), findsOneWidget);
      expect(tester.getRect(find.byKey(const Key('register_account_type_freelancer'))).height, greaterThan(20));
    });
  });

  group('auth redirect after login/register', () {
    test('freelancer uses freelancer home branch', () {
      expect(_user(role: 'freelancer').usesFreelancerExperience, isTrue);
      expect(_user(role: 'client').usesFreelancerExperience, isFalse);
      expect(_user(role: 'client').usesClientExperience, isTrue);
    });

    test('OTP verify does not resend role — role is already stored', () {
      final src = File('lib/features/auth/data/auth_api.dart').readAsStringSync();
      expect(src, contains("'/auth/verify-register-otp'"));
      expect(src, contains("data: {'email': email.trim(), 'otp': otp.trim()}"));
    });

    test('register screen no longer hardcodes client-only signup', () {
      final src = File('lib/features/auth/presentation/register_screen.dart').readAsStringSync();
      expect(src, contains('PublicSignupAccountType.freelancer'));
      expect(src, contains('buildRegisterRequestBody'));
      expect(src.contains("'accountType': 'client'"), isFalse);
    });
  });

  group('pantry public progress copy', () {
    test('shows current / required and closed / minimum-not-met', () {
      final collecting = PantryRequest.fromJson({
        'id': 1,
        'title': 'p',
        'bidCollection': {
          'requiredBidCount': 5,
          'currentBidCount': 2,
          'bidCollectionStatus': 'collecting',
        },
      });
      expect(pantryPublicBidProgressLabel(collecting), 'المتقدمون 2 / 5');

      final closed = PantryRequest.fromJson({
        'id': 2,
        'title': 'p',
        'bidCollection': {
          'requiredBidCount': 5,
          'currentBidCount': 5,
          'thresholdReached': true,
        },
      });
      expect(pantryPublicBidProgressLabel(closed), contains('مغلق'));

      final minNotMet = PantryRequest.fromJson({
        'id': 3,
        'title': 'p',
        'bidCollection': {
          'requiredBidCount': 5,
          'currentBidCount': 1,
          'bidCollectionStatus': 'minimum_not_met',
        },
      });
      expect(pantryPublicBidProgressLabel(minNotMet), contains('الحد الأدنى'));
    });
  });
}
