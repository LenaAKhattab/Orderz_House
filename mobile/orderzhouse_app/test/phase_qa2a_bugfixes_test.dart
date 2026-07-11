import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/core/constants/web_constants.dart';
import 'package:orderzhouse_app/core/router/auth_redirect_policy.dart';
import 'package:orderzhouse_app/core/router/routes.dart';
import 'package:orderzhouse_app/features/client_orders/data/payment_return_flow.dart';
import 'package:orderzhouse_app/features/client_orders/data/payment_return_parser.dart';

void main() {
  group('QA-2A C1 — payment return without auth', () {
    test('shouldRedirectUnauthenticatedToLogin is false for /payment/return', () {
      expect(
        shouldRedirectUnauthenticatedToLogin('/payment/return?status=success&orderId=1'),
        isFalse,
      );
      expect(isPublicPaymentReturnRoute('/payment/return'), isTrue);
    });

    test('client order paths still require login when unauthenticated', () {
      expect(shouldRedirectUnauthenticatedToLogin('/client/orders/42'), isTrue);
    });

    test('loginWithRedirect encodes return path without token', () {
      const params = PaymentReturnParams(
        orderId: '9',
        isSuccess: true,
        sessionId: 'cs_test_abc',
      );
      final loginUrl = AppRoutes.loginWithRedirect(params.toRouteLocation());
      expect(loginUrl, startsWith('${AppRoutes.login}?redirect='));
      expect(loginUrl, isNot(contains('accessToken')));
      expect(loginUrl, isNot(contains('Bearer')));
    });

    test('sanitizeLoginRedirect allows relative in-app paths only', () {
      expect(
        sanitizeLoginRedirect('/payment/return?status=success&orderId=1'),
        '/payment/return?status=success&orderId=1',
      );
      expect(sanitizeLoginRedirect('https://evil.com'), isNull);
      expect(sanitizeLoginRedirect('//evil.com'), isNull);
    });
  });

  group('QA-2A C1 — PaymentReturnScreen flow helpers', () {
    test('guest does not attempt backend confirm', () {
      expect(
        shouldAttemptPaymentConfirmOnReturn(isAuthenticated: false, isCancel: false),
        isFalse,
      );
      expect(
        initialPaymentReturnUiState(isAuthenticated: false, isCancel: false),
        PaymentReturnUiState.guestNeedsLogin,
      );
    });

    test('authenticated success flow starts confirming', () {
      expect(
        shouldAttemptPaymentConfirmOnReturn(isAuthenticated: true, isCancel: false),
        isTrue,
      );
      expect(
        initialPaymentReturnUiState(isAuthenticated: true, isCancel: false),
        PaymentReturnUiState.confirming,
      );
    });

    test('cancel skips confirm for authenticated user', () {
      expect(
        shouldAttemptPaymentConfirmOnReturn(isAuthenticated: true, isCancel: true),
        isFalse,
      );
      expect(
        initialPaymentReturnUiState(isAuthenticated: true, isCancel: true),
        PaymentReturnUiState.cancel,
      );
    });

    test('paid UI requires backend paymentStatus paid', () {
      expect(isOrderPaidFromBackend('paid'), isTrue);
      expect(isOrderPaidFromBackend('pending'), isFalse);
      expect(isOrderPaidFromBackend(null), isFalse);
      expect(isOrderPaidFromBackend('success'), isFalse);
    });

    test('deep link success alone does not imply paid', () {
      const params = PaymentReturnParams(orderId: '1', isSuccess: true);
      expect(params.isSuccess, isTrue);
      expect(isOrderPaidFromBackend(null), isFalse);
    });
  });

  group('QA-2A H1 — WebConstants', () {
    test('platform fallback Android uses 10.0.2.2', () {
      expect(
        WebConstants.platformFallbackBaseUrl(isAndroid: true),
        'http://10.0.2.2:5173',
      );
    });

    test('platform fallback non-Android uses localhost', () {
      expect(
        WebConstants.platformFallbackBaseUrl(isAndroid: false),
        'http://localhost:5173',
      );
    });

    test('buildWebPath uses configured base on test host', () {
      expect(
        WebConstants.buildWebPath('/dashboard/freelancer/plans'),
        '${WebConstants.platformFallbackBaseUrl(isAndroid: false)}/dashboard/freelancer/plans',
      );
    });
  });

  group('Splash infinite loading guard', () {
    test('router redirect reads auth without recreating GoRouter on auth watch', () {
      final src = File('lib/core/router/app_router.dart').readAsStringSync();
      expect(src.contains('ref.watch(authControllerProvider)'), isFalse);
      expect(src.contains('ref.read(authControllerProvider)'), isTrue);
      expect(src.contains('refreshListenable: refresh'), isTrue);
    });
  });
}
