import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/core/router/auth_redirect_policy.dart';
import 'package:orderzhouse_app/core/router/routes.dart';

void main() {
  group('iOS startup hang guards', () {
    test('splash does not await push.initialize before routing', () {
      final src =
          File('lib/features/auth/presentation/splash_screen.dart').readAsStringSync();
      expect(src, contains('unawaited(push.initialize()'));
      expect(src, isNot(contains('Future.wait([')));
      expect(src, isNot(contains('await push.initialize()')));
      expect(src, isNot(contains('await push.onAuthenticated()')));
      expect(src, contains('unawaited(push.onAuthenticated()'));
      expect(src, contains('AppRoutes.login'));
    });

    test('router leaves splash when unauthenticated (no infinite loading)', () {
      final src = File('lib/core/router/app_router.dart').readAsStringSync();
      expect(src, contains('if (isSplash) return AppRoutes.login'));
      expect(
        src,
        isNot(contains('if (isAuthRoute || isSplash) return null')),
      );
    });

    test('auth bootstrap has timeout so /auth/me cannot hang forever', () {
      final src =
          File('lib/features/auth/presentation/auth_controller.dart').readAsStringSync();
      expect(src, contains('bootstrapSession()'));
      expect(src, contains('.timeout('));
      expect(src, contains('AuthStatus.unauthenticated'));
    });

    test('push initialize timeouts Firebase / getInitialMessage', () {
      final src =
          File('lib/features/push/data/push_notification_service.dart').readAsStringSync();
      expect(src, contains('Firebase.initializeApp()'));
      expect(src, contains('.timeout(const Duration(seconds: 8))'));
      expect(src, contains('getInitialMessage()'));
      expect(src, contains('.timeout(const Duration(seconds: 3))'));
    });

    test('main Firebase init has timeout', () {
      final src = File('lib/main.dart').readAsStringSync();
      expect(src, contains('Firebase.initializeApp()'));
      expect(src, contains('.timeout(const Duration(seconds: 8))'));
    });

    test('fresh / unauthenticated policy still allows login routes', () {
      expect(shouldRedirectUnauthenticatedToLogin(AppRoutes.login), isFalse);
      expect(shouldRedirectUnauthenticatedToLogin(AppRoutes.register), isFalse);
      expect(shouldRedirectUnauthenticatedToLogin(AppRoutes.home), isTrue);
    });
  });
}
