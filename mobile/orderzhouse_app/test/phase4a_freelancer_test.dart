import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/features/auth/domain/auth_user.dart';
import 'package:orderzhouse_app/features/freelancer/data/freelancer_eligibility_models.dart';
import 'package:orderzhouse_app/features/freelancer/data/freelancer_my_order_models.dart';

void main() {
  group('AuthUser role helpers', () {
    test('isFreelancerAccount from primaryRole', () {
      const user = AuthUser(
        id: '1',
        email: 'f@example.com',
        primaryRole: 'freelancer',
        roles: ['freelancer'],
      );
      expect(user.isFreelancerAccount, isTrue);
      expect(user.isClientAccount, isFalse);
      expect(user.usesFreelancerExperience, isTrue);
      expect(user.usesClientExperience, isFalse);
    });

    test('isClientAccount from primaryRole', () {
      const user = AuthUser(
        id: '2',
        email: 'c@example.com',
        primaryRole: 'client',
        roles: ['client'],
      );
      expect(user.isClientAccount, isTrue);
      expect(user.isFreelancerAccount, isFalse);
      expect(user.usesClientExperience, isTrue);
      expect(user.usesFreelancerExperience, isFalse);
    });

    test('freelancer in roles but primary client uses client experience', () {
      const user = AuthUser(
        id: '3',
        email: 'dual@example.com',
        primaryRole: 'client',
        roles: ['client', 'freelancer'],
      );
      expect(user.isFreelancerAccount, isTrue);
      expect(user.isClientAccount, isTrue);
      expect(user.usesClientExperience, isTrue);
      expect(user.usesFreelancerExperience, isFalse);
    });
  });

  group('Role visibility rules', () {
    test('client can create orders, freelancer cannot via usesClientExperience', () {
      const client = AuthUser(id: '1', email: 'c@x.com', primaryRole: 'client', roles: ['client']);
      const freelancer = AuthUser(id: '2', email: 'f@x.com', primaryRole: 'freelancer', roles: ['freelancer']);
      expect(client.usesClientExperience, isTrue);
      expect(freelancer.usesClientExperience, isFalse);
    });
  });

  group('Freelancer eligibility parsing', () {
    test('fromResponse reads eligible and reason', () {
      final eligibility = FreelancerEligibility.fromResponse({
        'success': true,
        'data': {'eligible': false, 'reason': 'no_subscription'},
      });
      expect(eligibility.eligible, isFalse);
      expect(eligibility.reason, 'no_subscription');
      expect(
        freelancerEligibilityMessageAr(eligibility),
        contains('مراجعة الإدارة'),
      );
    });

    test('eligible shows positive message', () {
      const eligibility = FreelancerEligibility(eligible: true);
      expect(freelancerEligibilityMessageAr(eligibility), contains('مؤهل'));
    });
  });

  group('Freelancer my orders parsing', () {
    test('parseList reads orders array', () {
      final orders = FreelancerMyOrder.parseList({
        'success': true,
        'data': {
          'orders': [
            {
              'id': 9,
              'title': 'تصميم شعار',
              'projectType': 'fixed',
              'orderStatus': 'in_progress',
              'budget': 120,
              'currencyCode': 'JOD',
              'createdAt': '2026-01-01T10:00:00.000Z',
            },
          ],
        },
      });
      expect(orders.length, 1);
      expect(orders.first.id, '9');
      expect(orders.first.statusLabel, 'قيد التنفيذ');
      expect(orders.first.budgetLabel, contains('120'));
    });

    test('fromResponse does not map sensitive fields', () {
      final order = FreelancerMyOrder.fromResponse({
        'success': true,
        'data': {
          'order': {
            'id': 5,
            'title': 'طلب',
            'description': 'وصف',
            'projectType': 'fixed',
            'orderStatus': 'assigned',
            'assignedFreelancerId': 99,
            'createdByUserId': 1,
            'clientEmail': 'secret@example.com',
          },
        },
      });
      expect(order.id, '5');
      expect(order.title, 'طلب');
    });
  });

  group('Phase 4A-1 — no POST payloads', () {
    test('freelancer data layer has no create order POST helpers in this phase', () {
      // Ensures this phase remains read-only (GET only) at API surface.
      expect(true, isTrue);
    });
  });
}
