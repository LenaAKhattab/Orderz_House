import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/features/client_orders/data/client_order_models.dart';
import 'package:orderzhouse_app/features/orders/data/pool_order_models.dart';

void main() {
  group('PoolOrder detail parsing', () {
    test('fromResponse reads nested order with duration and dueAt', () {
      final order = PoolOrder.fromResponse({
        'success': true,
        'data': {
          'order': {
            'id': '55',
            'title': 'تصميم شعار',
            'description': 'وصف آمن',
            'projectType': 'fixed',
            'orderStatus': 'open_for_freelancers',
            'budget': 120,
            'currencyCode': 'JOD',
            'durationValue': 5,
            'durationUnit': 'days',
            'dueAt': '2026-02-01T12:00:00.000Z',
            'poolListedAt': '2026-01-20T08:00:00.000Z',
            'category': {'id': '2', 'name': 'تصميم'},
            'filesCount': 2,
            'hasAssignedFreelancer': false,
          },
        },
      });

      expect(order.id, '55');
      expect(order.durationText, '5 يوم');
      expect(order.dueAt, isNotNull);
      expect(order.filesCount, 2);
      expect(order.budgetLabel, contains('120'));
    });

    test('fromJson supports snake_case detail fields', () {
      final order = PoolOrder.fromJson({
        'id': '9',
        'title': 'مناقصة',
        'project_type': 'bidding',
        'bid_budget_min': 30,
        'bid_budget_max': 90,
        'accepts_price_bids': true,
        'applicants_count': 3,
      });

      expect(order.isBidding, isTrue);
      expect(order.applicantsCount, 3);
    });
  });

  group('ClientOrder parsing', () {
    test('parseList reads client orders array', () {
      final orders = ClientOrder.parseList({
        'success': true,
        'data': {
          'orders': [
            {
              'id': '201',
              'title': 'طلبي',
              'projectType': 'fixed',
              'orderStatus': 'in_progress',
              'budget': 250,
              'currencyCode': 'JOD',
              'paymentStatus': 'paid',
              'createdAt': '2026-01-10T09:00:00.000Z',
              'hasAssignedFreelancer': true,
            },
          ],
        },
      });

      expect(orders, hasLength(1));
      expect(orders.first.statusLabel, 'قيد التنفيذ');
      expect(orders.first.paymentStatusLabel, 'مدفوع');
      expect(orders.first.hasAssignedFreelancer, isTrue);
    });

    test('fromResponse parses sanitized bid users display names only', () {
      final order = ClientOrder.fromResponse({
        'success': true,
        'data': {
          'order': {
            'id': '301',
            'title': 'تفاصيل',
            'orderStatus': 'submitted',
            'hasAssignedFreelancer': true,
            'bidUsers': [
              {
                'bidId': 'b1',
                'amount': 200,
                'status': 'accepted',
                'displayName': 'أحمد محمد',
              },
            ],
            'submissionHistory': {
              'submissions': [
                {
                  'id': 's1',
                  'status': 'pending_review',
                  'createdAt': '2026-02-05T10:00:00.000Z',
                  'files': [{'id': 'f1'}],
                },
              ],
            },
          },
        },
      });

      expect(order.assignedFreelancerLabel, 'أحمد محمد');
      expect(order.submissions, hasLength(1));
      expect(order.submissions.first.filesCount, 1);
    });

    test('ignores sensitive fields not mapped in model', () {
      final order = ClientOrder.fromJson({
        'id': '1',
        'title': 'x',
        'createdByUserId': 'secret-user',
        'clientEmail': 'secret@example.com',
      });

      expect(order.id, '1');
      expect(order.title, 'x');
    });
  });
}
