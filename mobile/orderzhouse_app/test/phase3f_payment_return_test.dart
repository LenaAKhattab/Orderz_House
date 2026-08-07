import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/features/client_orders/data/create_order_models.dart';
import 'package:orderzhouse_app/features/client_orders/data/payment_return_parser.dart';

void main() {
  group('PaymentReturnParams deep link parsing', () {
    test('parses success deep link', () {
      final params = PaymentReturnParams.fromUri(
        Uri.parse('orderzhouse://payment/success?orderId=1&session_id=cs_test_abc'),
      );

      expect(params, isNotNull);
      expect(params!.orderId, '1');
      expect(params.sessionId, 'cs_test_abc');
      expect(params.isSuccess, isTrue);
      expect(params.isCancel, isFalse);
    });

    test('parses cancel deep link', () {
      final params = PaymentReturnParams.fromUri(
        Uri.parse('orderzhouse://payment/cancel?orderId=42'),
      );

      expect(params, isNotNull);
      expect(params!.orderId, '42');
      expect(params.isCancel, isTrue);
    });

    test('rejects non-payment scheme', () {
      expect(
        PaymentReturnParams.fromUri(Uri.parse('https://example.com/payment/success')),
        isNull,
      );
    });

    test('toRouteLocation builds go_router path', () {
      const params = PaymentReturnParams(
        orderId: '7',
        isSuccess: true,
        sessionId: 'cs_x',
      );
      final loc = params.toRouteLocation();
      expect(loc, contains('/payment/return'));
      expect(loc, contains('status=success'));
      expect(loc, contains('orderId=7'));
      expect(loc, contains('session_id=cs_x'));
    });

    test('parses sessionId camelCase alias', () {
      final params = PaymentReturnParams.fromUri(
        Uri.parse('orderzhouse://payment/success?orderId=1&sessionId=cs_camel'),
      );
      expect(params?.sessionId, 'cs_camel');
    });
  });

  group('Payment return route query parsing', () {
    test('fromRouteQuery reads status and orderId', () {
      final params = PaymentReturnParams.fromRouteQuery({
        'status': 'cancel',
        'orderId': '5',
      });
      expect(params?.isCancel, isTrue);
    });
  });

  group('No Stripe secrets in create payload', () {
    test('buildCreateOrderPayload excludes stripe fields', () {
      const draft = CreateOrderDraft(
        projectType: 'fixed',
        categoryId: '1',
        title: 'طلب',
        description: 'وصف كافٍ للطلب هنا',
        durationValue: '3',
        budget: '50',
      );
      final payload = buildCreateOrderPayload(draft);
      expect(payload.containsKey('stripeSecretKey'), isFalse);
      expect(payload.containsKey('checkoutUrl'), isFalse);
    });
  });
}
