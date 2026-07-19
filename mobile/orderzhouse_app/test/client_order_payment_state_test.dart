import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/features/client_orders/data/client_order_models.dart';
import 'package:orderzhouse_app/features/client_orders/data/order_payment_models.dart';

void main() {
  group('client order payment state display', () {
    test('unpaid pending_payment shows pay now and waiting label', () {
      final order = ClientOrder.fromJson({
        'id': '1',
        'title': 'طلب ثابت',
        'projectType': 'fixed',
        'orderStatus': 'pending_payment',
        'paymentStatus': 'pending',
        'isPublished': false,
        'isOpenForPool': false,
        'requiresPayment': true,
        'canPayNow': true,
        'clientDisplayStatus': 'pending_payment',
        'clientDisplayStatusLabelAr': 'بانتظار الدفع',
      });

      expect(order.needsPayment, isTrue);
      expect(order.canPayNow, isTrue);
      expect(order.requiresAdminReview, isFalse);
      expect(order.statusLabel, 'بانتظار الدفع');
      expect(order.statusHintAr, contains('أكمل الدفع'));
    });

    test('paid pending admin review hides pay button', () {
      final order = ClientOrder.fromJson({
        'id': '2',
        'title': 'طلب مدفوع',
        'projectType': 'fixed',
        'orderStatus': 'pending_payment',
        'paymentStatus': 'paid',
        'isPublished': false,
        'isOpenForPool': false,
        'requiresPayment': false,
        'canPayNow': false,
        'requiresAdminReview': true,
        'clientDisplayStatus': 'pending_admin_review',
        'clientDisplayStatusLabelAr': 'بانتظار مراجعة الإدارة',
      });

      expect(order.needsPayment, isFalse);
      expect(order.canPayNow, isFalse);
      expect(order.requiresAdminReview, isTrue);
      expect(order.statusLabel, 'بانتظار مراجعة الإدارة');
      expect(order.statusHintAr, contains('مراجعته من الإدارة'));
    });

    test('orderNeedsPayment helpers', () {
      expect(
        orderNeedsPayment(
          projectType: 'fixed',
          paymentStatus: 'pending',
          orderStatus: 'pending_payment',
        ),
        isTrue,
      );
      expect(
        orderCanPayNow(needsPayment: true, canPayNowFlag: true),
        isTrue,
      );
      expect(
        orderRequiresAdminReview(
          paymentStatus: 'paid',
          isPublished: false,
          isOpenForPool: false,
          orderStatus: 'pending_payment',
        ),
        isTrue,
      );
    });

    test('pay now uses same order id (no duplicate create implied by model)', () {
      final order = ClientOrder.fromJson({
        'id': '42523',
        'title': 'طلب',
        'projectType': 'fixed',
        'orderStatus': 'pending_payment',
        'paymentStatus': 'pending',
        'canPayNow': true,
      });
      expect(order.id, '42523');
      expect(order.canPayNow, isTrue);
    });
  });
}
