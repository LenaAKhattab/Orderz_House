import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/core/router/auth_redirect_policy.dart';
import 'package:orderzhouse_app/core/router/deep_link_normalization.dart';
import 'package:orderzhouse_app/core/router/routes.dart';
import 'package:orderzhouse_app/features/client_orders/data/payment_return_parser.dart';

void main() {
  group('Phase 5G — payment deep link normalization', () {
    test('success deep link rewrites to /payment/return', () {
      final loc = normalizeOrderzhousePaymentDeepLink(
        Uri.parse('orderzhouse://payment/success?orderId=123&session_id=abc'),
      );
      expect(loc, isNotNull);
      expect(loc, startsWith('/payment/return?'));
      expect(loc, contains('status=success'));
      expect(loc, contains('orderId=123'));
      expect(loc, contains('session_id=abc'));
      expect(loc, isNot(contains('orderzhouse://')));
    });

    test('cancel deep link rewrites to /payment/return', () {
      final loc = normalizeOrderzhousePaymentDeepLink(
        Uri.parse('orderzhouse://payment/cancel?orderId=123'),
      );
      expect(loc, contains('status=cancel'));
      expect(loc, contains('orderId=123'));
    });

    test('success without query still rewrites (no GoException path)', () {
      final loc = normalizeOrderzhousePaymentDeepLink(
        Uri.parse('orderzhouse://payment/success'),
      );
      expect(loc, '/payment/return?status=success');
    });

    test('sessionId camelCase is normalized to session_id', () {
      final loc = normalizeOrderzhousePaymentDeepLink(
        Uri.parse('orderzhouse://payment/success?orderId=9&sessionId=cs_x'),
      );
      expect(loc, contains('session_id=cs_x'));
      expect(loc, isNot(contains('sessionId=')));
    });

    test('unknown query keys are dropped', () {
      final loc = normalizeOrderzhousePaymentDeepLink(
        Uri.parse(
          'orderzhouse://payment/success?orderId=1&session_id=s&accessToken=SECRET&foo=bar',
        ),
      )!;
      expect(loc, isNot(contains('accessToken')));
      expect(loc, isNot(contains('SECRET')));
      expect(loc, isNot(contains('foo=')));
      expect(loc, contains('orderId=1'));
      expect(loc, contains('session_id=s'));
    });

    test('rewriteIncomingDeepLinkLocation handles raw scheme strings', () {
      expect(
        rewriteIncomingDeepLinkLocation(
          'orderzhouse://payment/success?orderId=123&session_id=test',
        ),
        contains('/payment/return'),
      );
      expect(
        rewriteIncomingDeepLinkLocation('orderzhouse://payment/cancel?orderId=123'),
        contains('status=cancel'),
      );
    });

    test('in-app paths are not rewritten', () {
      expect(rewriteIncomingDeepLinkLocation('/home'), isNull);
      expect(rewriteIncomingDeepLinkLocation('/payment/return?status=success&orderId=1'), isNull);
      expect(rewriteIncomingDeepLinkLocation('/login'), isNull);
    });

    test('unknown orderzhouse link falls back to login (no crash)', () {
      expect(
        rewriteIncomingDeepLinkUri(Uri.parse('orderzhouse://unknown/path')),
        AppRoutes.login,
      );
      expect(
        rewriteIncomingDeepLinkLocation('orderzhouse://foo/bar'),
        AppRoutes.login,
      );
    });

    test('paymentParamsFromIncoming builds params after rewrite', () {
      final params = paymentParamsFromIncoming(
        Uri.parse('orderzhouse://payment/success?orderId=55&session_id=cs'),
      );
      expect(params, isNotNull);
      expect(params!.orderId, '55');
      expect(params.isSuccess, isTrue);
      expect(params.sessionId, 'cs');
    });

    test('parser accepts sessionId alias', () {
      final params = PaymentReturnParams.fromUri(
        Uri.parse('orderzhouse://payment/success?orderId=3&sessionId=cs_camel'),
      );
      expect(params?.sessionId, 'cs_camel');
    });
  });

  group('Phase 5G — auth-first remains intact', () {
    test('unauthenticated payment return stays allowed; home/marketplace blocked', () {
      expect(
        shouldRedirectUnauthenticatedToLogin('/payment/return?status=success&orderId=1'),
        isFalse,
      );
      expect(shouldRedirectUnauthenticatedToLogin(AppRoutes.home), isTrue);
      expect(shouldRedirectUnauthenticatedToLogin(AppRoutes.marketplace), isTrue);
      expect(shouldRedirectUnauthenticatedToLogin(AppRoutes.profile), isTrue);
    });

    test('login/register do not redirect (no loop)', () {
      expect(shouldRedirectUnauthenticatedToLogin(AppRoutes.login), isFalse);
      expect(shouldRedirectUnauthenticatedToLogin(AppRoutes.register), isFalse);
    });

    test('safe fallback respects auth', () {
      expect(safeFallbackLocation(isAuthenticated: false), AppRoutes.login);
      expect(safeFallbackLocation(isAuthenticated: true), AppRoutes.home);
    });
  });

  group('Phase 5G — router source guards', () {
    test('app_router wires onException only (not errorBuilder) and deep link rewrite', () {
      final src = File('lib/core/router/app_router.dart').readAsStringSync();
      expect(src, contains('onException'));
      expect(src, isNot(contains('errorBuilder:')));
      expect(src, isNot(contains('errorPageBuilder:')));
      expect(src, contains('rewriteIncomingDeepLinkUri'));
      expect(src, contains('rewriteIncomingDeepLinkLocation'));
    });

    test('DeepLinkListener uses normalization', () {
      final src = File('lib/core/router/deep_link_listener.dart').readAsStringSync();
      expect(src, contains('rewriteIncomingDeepLinkUri'));
      expect(src, isNot(contains('PaymentReturnParams.fromUri')));
    });
  });
}
