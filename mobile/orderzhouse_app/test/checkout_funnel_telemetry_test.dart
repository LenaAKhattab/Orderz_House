import 'package:flutter_test/flutter_test.dart';
import 'package:orderzhouse_app/core/utils/checkout_funnel_telemetry.dart';

void main() {
  group('CheckoutFunnelTelemetry.sessionIdFromCheckoutUrl', () {
    test('extracts cs_test session id from Stripe path', () {
      expect(
        CheckoutFunnelTelemetry.sessionIdFromCheckoutUrl(
          'https://checkout.stripe.com/c/pay/cs_test_abc123XYZ',
        ),
        'cs_test_abc123XYZ',
      );
    });

    test('extracts cs_live session id', () {
      expect(
        CheckoutFunnelTelemetry.sessionIdFromCheckoutUrl(
          'https://checkout.stripe.com/c/pay/cs_live_prodSession_01',
        ),
        'cs_live_prodSession_01',
      );
    });

    test('returns null when no session id present', () {
      expect(
        CheckoutFunnelTelemetry.sessionIdFromCheckoutUrl('https://example.com/pay'),
        isNull,
      );
    });
  });

  group('CheckoutFunnelTelemetry.record', () {
    test('swallows when token missing (best-effort)', () async {
      await CheckoutFunnelTelemetry.record(
        eventType: 'checkout_redirect_started',
        stripeCheckoutSessionId: 'cs_test_no_token_session',
        paymentFlow: 'client_fixed',
        accessTokenReader: () async => null,
      );
    });

    test('ignores non-allowlisted event types without throwing', () async {
      await CheckoutFunnelTelemetry.record(
        eventType: 'checkout_requested',
        stripeCheckoutSessionId: 'cs_test_ignored_event',
        accessTokenReader: () async => 'token',
      );
      await CheckoutFunnelTelemetry.record(
        eventType: 'not_a_real_event',
        stripeCheckoutSessionId: 'cs_test_ignored_event',
        accessTokenReader: () async => 'token',
      );
    });

    test('ignores invalid session ids without throwing', () async {
      await CheckoutFunnelTelemetry.record(
        eventType: 'checkout_redirect_started',
        stripeCheckoutSessionId: 'evil;drop',
        accessTokenReader: () async => 'token',
      );
    });
  });
}
