import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/features/client_orders/data/create_order_models.dart';
import 'package:orderzhouse_app/features/client_orders/data/order_payment_models.dart';

void main() {
  group('CreateOrderResult payment parsing', () {
    test('fixed order parses checkoutUrl and sessionId when requiresPayment', () {
      final result = CreateOrderResult.fromResponse({
        'success': true,
        'data': {
          'order': {'id': '501', 'projectType': 'fixed'},
          'requiresPayment': true,
          'checkoutUrl': 'https://checkout.stripe.com/c/pay/cs_test_abc',
          'sessionId': 'cs_test_abc',
          'paymentPurpose': 'fixed_order_creation',
        },
      });

      expect(result.orderId, '501');
      expect(result.requiresPayment, isTrue);
      expect(result.checkoutUrl, contains('checkout.stripe.com'));
      expect(result.sessionId, 'cs_test_abc');
      expect(result.needsPaymentFlow, isTrue);
      expect(result.canPayNow, isTrue);
    });

    test('bidding order has no checkoutUrl and no payment flow', () {
      final result = CreateOrderResult.fromResponse({
        'success': true,
        'data': {
          'order': {'id': '88', 'projectType': 'bidding'},
          'requiresPayment': false,
        },
      });

      expect(result.requiresPayment, isFalse);
      expect(result.checkoutUrl, isNull);
      expect(result.sessionId, isNull);
      expect(result.needsPaymentFlow, isFalse);
      expect(result.canPayNow, isFalse);
    });

    test('checkoutUrl required only when requiresPayment is true for fixed', () {
      final paidPending = CreateOrderResult.fromResponse({
        'success': true,
        'data': {
          'order': {'id': '1', 'projectType': 'fixed'},
          'requiresPayment': true,
          'checkoutUrl': 'https://checkout.stripe.com/x',
        },
      });
      expect(paidPending.requiresPayment, isTrue);
      expect(paidPending.checkoutUrl, isNotNull);

      final bidding = CreateOrderResult.fromResponse({
        'success': true,
        'data': {
          'order': {'id': '2', 'projectType': 'bidding'},
          'requiresPayment': false,
        },
      });
      expect(bidding.checkoutUrl, isNull);
    });
  });

  group('OrderCheckoutSession from pay-checkout', () {
    test('parses checkout session response', () {
      final session = OrderCheckoutSession.fromResponse({
        'success': true,
        'data': {
          'checkoutUrl': 'https://checkout.stripe.com/c/pay/cs_live_xyz',
          'sessionId': 'cs_live_xyz',
        },
      });

      expect(session.hasCheckoutUrl, isTrue);
      expect(session.sessionId, 'cs_live_xyz');
    });
  });

  group('orderNeedsPayment helper', () {
    test('fixed pending payment needs payment', () {
      expect(
        orderNeedsPayment(
          projectType: 'fixed',
          paymentStatus: 'pending',
          orderStatus: 'pending_payment',
        ),
        isTrue,
      );
    });

    test('fixed paid does not need payment', () {
      expect(
        orderNeedsPayment(
          projectType: 'fixed',
          paymentStatus: 'paid',
          orderStatus: 'published',
        ),
        isFalse,
      );
    });

    test('bidding never needs fixed checkout payment', () {
      expect(
        orderNeedsPayment(
          projectType: 'bidding',
          paymentStatus: 'unpaid',
          orderStatus: 'open_for_bids',
        ),
        isFalse,
      );
    });
  });

  group('No Stripe secrets in payload', () {
    test('buildCreateOrderPayload has no stripe keys', () {
      const draft = CreateOrderDraft(
        projectType: 'fixed',
        categoryId: '1',
        title: 'طلب ثابت',
        description: 'وصف الطلب الكافي هنا',
        durationValue: '5',
        budget: '100',
      );
      final payload = buildCreateOrderPayload(draft);

      expect(payload.containsKey('stripeSecretKey'), isFalse);
      expect(payload.containsKey('checkoutUrl'), isFalse);
      expect(payload.containsKey('sessionId'), isFalse);
    });
  });
}
