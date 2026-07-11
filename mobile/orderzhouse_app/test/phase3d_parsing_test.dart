import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/features/client_orders/data/create_order_models.dart';

void main() {
  group('Create order validation — fixed', () {
    test('rejects missing budget', () {
      const draft = CreateOrderDraft(
        projectType: 'fixed',
        categoryId: '3',
        title: 'تصميم شعار',
        description: 'وصف كافٍ للطلب هنا',
        durationValue: '5',
        budget: '',
      );
      final result = validateCreateOrderDraft(draft);
      expect(result.isValid, isFalse);
      expect(result.errorFor('budget'), isNotNull);
    });

    test('accepts valid fixed draft', () {
      const draft = CreateOrderDraft(
        projectType: 'fixed',
        categoryId: '3',
        title: 'تصميم شعار',
        description: 'وصف كافٍ للطلب هنا',
        durationValue: '5',
        budget: '150',
      );
      final result = validateCreateOrderDraft(draft);
      expect(result.isValid, isTrue);
    });
  });

  group('Create order validation — bidding', () {
    test('rejects max less than min', () {
      const draft = CreateOrderDraft(
        projectType: 'bidding',
        categoryId: '2',
        title: 'تطوير موقع',
        description: 'وصف كافٍ للطلب هنا',
        durationValue: '7',
        bidBudgetMin: '200',
        bidBudgetMax: '100',
      );
      final result = validateCreateOrderDraft(draft);
      expect(result.isValid, isFalse);
      expect(result.errorFor('bidBudgetMax'), isNotNull);
    });

    test('accepts valid bidding draft', () {
      const draft = CreateOrderDraft(
        projectType: 'bidding',
        categoryId: '2',
        title: 'تطوير موقع',
        description: 'وصف كافٍ للطلب هنا',
        durationValue: '7',
        bidBudgetMin: '100',
        bidBudgetMax: '300',
      );
      expect(validateCreateOrderDraft(draft).isValid, isTrue);
    });
  });

  group('Create order payload', () {
    test('buildCreateOrderPayload excludes sensitive fields', () {
      const draft = CreateOrderDraft(
        projectType: 'bidding',
        categoryId: '4',
        title: 'طلب جديد',
        description: 'وصف الطلب الكافي هنا',
        durationValue: '3',
        bidBudgetMin: '50',
        bidBudgetMax: '120',
      );
      final payload = buildCreateOrderPayload(draft);

      expect(payload.containsKey('userId'), isFalse);
      expect(payload.containsKey('clientId'), isFalse);
      expect(payload.containsKey('status'), isFalse);
      expect(payload.containsKey('paymentStatus'), isFalse);
      expect(payload.containsKey('assignedFreelancerId'), isFalse);
      expect(payload['projectType'], 'bidding');
      expect(payload['categoryId'], 4);
      expect(payload['bidBudgetMin'], 50.0);
      expect(payload['bidBudgetMax'], 120.0);
    });

    test('fixed payload includes budget only', () {
      const draft = CreateOrderDraft(
        projectType: 'fixed',
        categoryId: '1',
        title: 'طلب ثابت',
        description: 'وصف الطلب الكافي هنا',
        durationValue: '10',
        budget: '99.5',
      );
      final payload = buildCreateOrderPayload(draft);

      expect(payload['budget'], 99.5);
      expect(payload.containsKey('bidBudgetMin'), isFalse);
      expect(payload.containsKey('bidBudgetMax'), isFalse);
    });
  });

  group('Create order response parsing', () {
    test('fromResponse reads order id and requiresPayment', () {
      final result = CreateOrderResult.fromResponse({
        'success': true,
        'data': {
          'order': {'id': '501', 'projectType': 'fixed'},
          'requiresPayment': true,
          'checkoutUrl': 'https://checkout.stripe.com/ignored',
          'sessionId': 'cs_test_123',
        },
      });

      expect(result.orderId, '501');
      expect(result.requiresPayment, isTrue);
      expect(result.projectType, 'fixed');
      expect(result.checkoutUrl, contains('checkout.stripe.com'));
      expect(result.sessionId, isNotNull);
    });

    test('bidding response has requiresPayment false', () {
      final result = CreateOrderResult.fromResponse({
        'success': true,
        'data': {
          'order': {'id': '88', 'projectType': 'bidding'},
          'requiresPayment': false,
        },
      });

      expect(result.orderId, '88');
      expect(result.requiresPayment, isFalse);
    });
  });
}
