import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/features/client_orders/data/payment_return_flow.dart';
import 'package:orderzhouse_app/features/client_orders/data/payment_return_parser.dart';

void main() {
  group('payment return confirm flow', () {
    test('success return starts in confirming for authenticated user', () {
      expect(
        initialPaymentReturnUiState(isAuthenticated: true, isCancel: false),
        PaymentReturnUiState.confirming,
      );
      expect(
        shouldAttemptPaymentConfirmOnReturn(isAuthenticated: true, isCancel: false),
        isTrue,
      );
    });

    test('cancel does not attempt confirm', () {
      expect(
        initialPaymentReturnUiState(isAuthenticated: true, isCancel: true),
        PaymentReturnUiState.cancel,
      );
      expect(
        shouldAttemptPaymentConfirmOnReturn(isAuthenticated: true, isCancel: true),
        isFalse,
      );
    });

    test('after confirm attempts unpaid maps to soft pending not error', () {
      expect(
        paymentReturnStateAfterConfirmAttempts(paymentStatus: 'pending'),
        PaymentReturnUiState.pending,
      );
      expect(
        paymentReturnStateAfterConfirmAttempts(paymentStatus: 'paid'),
        PaymentReturnUiState.paid,
      );
    });

    test('pending and cancel copy are soft Arabic messages', () {
      expect(paymentReturnPendingMessageAr, contains('يستغرق'));
      expect(paymentReturnPendingMessageAr.toLowerCase(), isNot(contains('فشل')));
      expect(paymentReturnCancelTitleAr, 'لم يتم إكمال الدفع');
      expect(paymentCheckoutOpenedNoteAr, isNot(contains('لم يتم تأكيد الدفع بعد')));
    });

    test('poll config covers ~20–30s window', () {
      final totalSeconds =
          paymentConfirmPollAttempts * paymentConfirmPollInterval.inSeconds;
      expect(totalSeconds, greaterThanOrEqualTo(20));
      expect(totalSeconds, lessThanOrEqualTo(30));
    });
  });

  group('payment return parser', () {
    test('parses success with session for reconcile', () {
      final params = PaymentReturnParams.fromUri(
        Uri.parse('orderzhouse://payment/success?orderId=12&session_id=cs_test_x'),
      );
      expect(params?.isSuccess, isTrue);
      expect(params?.sessionId, 'cs_test_x');
      expect(params?.toRouteLocation(), contains('session_id=cs_test_x'));
    });

    test('parses cancel for safe cancel UI', () {
      final params = PaymentReturnParams.fromRouteQuery({
        'status': 'cancel',
        'orderId': '9',
      });
      expect(params?.isCancel, isTrue);
    });
  });
}
