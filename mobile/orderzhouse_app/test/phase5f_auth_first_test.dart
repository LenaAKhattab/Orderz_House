import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/core/router/auth_redirect_policy.dart';
import 'package:orderzhouse_app/core/router/routes.dart';
import 'package:orderzhouse_app/features/client_orders/data/payment_return_flow.dart';
import 'package:orderzhouse_app/features/profile/domain/profile_actions.dart';

void main() {
  group('Phase 5F — auth-first redirect policy', () {
    test('unauthenticated protected routes redirect to login', () {
      expect(shouldRedirectUnauthenticatedToLogin(AppRoutes.home), isTrue);
      expect(shouldRedirectUnauthenticatedToLogin(AppRoutes.marketplace), isTrue);
      expect(shouldRedirectUnauthenticatedToLogin(AppRoutes.services), isTrue);
      expect(shouldRedirectUnauthenticatedToLogin('/orders/pool/42'), isTrue);
      expect(shouldRedirectUnauthenticatedToLogin(AppRoutes.myOrders), isTrue);
      expect(shouldRedirectUnauthenticatedToLogin(AppRoutes.profile), isTrue);
      expect(shouldRedirectUnauthenticatedToLogin(AppRoutes.notifications), isTrue);
      expect(shouldRedirectUnauthenticatedToLogin(AppRoutes.clientCreateOrder), isTrue);
      expect(shouldRedirectUnauthenticatedToLogin('/freelancer/my-orders/9'), isTrue);
    });

    test('auth routes and splash do not redirect (no loop)', () {
      expect(shouldRedirectUnauthenticatedToLogin(AppRoutes.login), isFalse);
      expect(shouldRedirectUnauthenticatedToLogin(AppRoutes.register), isFalse);
      expect(shouldRedirectUnauthenticatedToLogin(AppRoutes.otp), isFalse);
      expect(shouldRedirectUnauthenticatedToLogin('${AppRoutes.otp}?email=a%40b.com'), isFalse);
      expect(shouldRedirectUnauthenticatedToLogin(AppRoutes.splash), isFalse);
    });

    test('register remains available without auth', () {
      expect(isUnauthenticatedAllowedRoute(AppRoutes.register), isTrue);
      expect(shouldRedirectUnauthenticatedToLogin(AppRoutes.register), isFalse);
    });

    test('payment return stays reachable without auth redirect', () {
      expect(
        shouldRedirectUnauthenticatedToLogin('/payment/return?status=success&orderId=1'),
        isFalse,
      );
      expect(isPublicPaymentReturnRoute('/payment/return'), isTrue);
      expect(
        initialPaymentReturnUiState(isAuthenticated: false, isCancel: false),
        PaymentReturnUiState.guestNeedsLogin,
      );
    });

    test('public legal pages allowed without shell browsing', () {
      expect(shouldRedirectUnauthenticatedToLogin('/public/privacy-policy'), isFalse);
      expect(shouldRedirectUnauthenticatedToLogin('/public/terms-conditions'), isFalse);
    });

    test('sanitizeLoginRedirect rejects auth/splash loop targets', () {
      expect(sanitizeLoginRedirect(AppRoutes.login), isNull);
      expect(sanitizeLoginRedirect(AppRoutes.register), isNull);
      expect(sanitizeLoginRedirect(AppRoutes.splash), isNull);
      expect(sanitizeLoginRedirect(AppRoutes.home), AppRoutes.home);
      expect(
        sanitizeLoginRedirect('/payment/return?status=success&orderId=1'),
        '/payment/return?status=success&orderId=1',
      );
    });
  });

  group('Phase 5F — splash / login / logout / UI source guards', () {
    test('splash routes unauthenticated users to login', () {
      final src = File('lib/features/auth/presentation/splash_screen.dart').readAsStringSync();
      expect(src, contains('AppRoutes.login'));
      expect(src, contains('auth.isAuthenticated ? AppRoutes.home : AppRoutes.login'));
    });

    test('login has create-account CTA and no guest marketplace browse', () {
      final src = File('lib/features/auth/presentation/login_screen.dart').readAsStringSync();
      expect(src, contains('تسجيل الدخول'));
      expect(src, contains('إنشاء حساب'));
      expect(src, contains('AppRoutes.register'));
      expect(src, isNot(contains('تصفح سوق')));
      expect(src, isNot(contains('Icons.close_rounded')));
    });

    test('home has no guest marketplace CTA copy', () {
      final src = File('lib/features/home/presentation/home_screen.dart').readAsStringSync();
      expect(src, isNot(contains('ابدأ مع أوردرز هاوس')));
      expect(src, isNot(contains('تصفح السوق أو سجّل الدخول للبدء')));
      expect(src, isNot(contains('تصفح سوق الطلبات')));
    });

    test('main shell hides bottom nav when unauthenticated', () {
      final src = File('lib/features/shell/main_shell.dart').readAsStringSync();
      expect(src, contains('auth.isAuthenticated'));
      expect(src, contains('bottomNavigationBar: auth.isAuthenticated'));
      expect(src, contains(': null'));
    });

    test('logout navigates to login not home', () {
      final src = File('lib/features/profile/presentation/profile_screen.dart').readAsStringSync();
      expect(src, contains('context.go(AppRoutes.login)'));
      expect(src, isNot(contains('_GuestProfileBody')));
      expect(src, isNot(contains('context.go(AppRoutes.home)')));
    });

    test('payment return guest CTA does not open home browsing', () {
      final src =
          File('lib/features/client_orders/presentation/payment_return_screen.dart').readAsStringSync();
      expect(src, contains('تسجيل الدخول لتأكيد الدفع'));
      expect(src, isNot(contains('العودة للرئيسية')));
      expect(src, isNot(contains("context.go(AppRoutes.home)")));
    });

    test('guest profile actions no longer advertise marketplace browse', () {
      expect(
        profileGuestQuickActions().any((a) => a.id == ProfileActionId.marketplace),
        isFalse,
      );
    });

    test('router uses loginWithRedirect for unauthenticated protected paths', () {
      final src = File('lib/core/router/app_router.dart').readAsStringSync();
      expect(src, contains('loginWithRedirect'));
      expect(src, contains('shouldRedirectUnauthenticatedToLogin'));
    });
  });
}
