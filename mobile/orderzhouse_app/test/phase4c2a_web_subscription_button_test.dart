import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/core/constants/web_constants.dart';
import 'package:orderzhouse_app/features/freelancer/data/freelancer_plans_models.dart';

void main() {
  group('WebConstants', () {
    test('buildWebPath avoids double slash', () {
      final base = WebConstants.platformFallbackBaseUrl(isAndroid: false);
      expect(
        WebConstants.buildWebPath('/dashboard/freelancer/plans'),
        '$base/dashboard/freelancer/plans',
      );
      expect(WebConstants.freelancerPlansUrl, '$base/dashboard/freelancer/plans');
    });

    test('freelancer plans path is dashboard route', () {
      expect(WebConstants.freelancerPlansPath, '/dashboard/freelancer/plans');
    });
  });

  group('Web subscription button policy', () {
    test('shows for non-current plans', () {
      const plan = PublicPlan(id: '2', checkoutPlanId: '2', title: 'مدفوعة');
      expect(
        shouldShowWebSubscriptionButton(
          plan: plan,
          isCurrentPlan: false,
          subscription: const FreelancerSubscriptionSnapshot(planId: '1', status: 'active'),
        ),
        isTrue,
      );
    });

    test('hides for current active plan without fee', () {
      const plan = PublicPlan(id: '2', checkoutPlanId: '2', title: 'مدفوعة');
      expect(
        shouldShowWebSubscriptionButton(
          plan: plan,
          isCurrentPlan: true,
          subscription: const FreelancerSubscriptionSnapshot(planId: '2', status: 'active'),
          activationFeeStatus: ActivationFeeStatus(isCurrent: true, needsPayment: false),
        ),
        isFalse,
      );
    });

    test('shows for current plan when activation fee needed', () {
      const plan = PublicPlan(id: '1', checkoutPlanId: '1', title: 'مجانية');
      expect(
        shouldShowWebSubscriptionButton(
          plan: plan,
          isCurrentPlan: true,
          subscription: const FreelancerSubscriptionSnapshot(planId: '1', status: 'assigned_not_started'),
          activationFeeStatus: ActivationFeeStatus(needsPayment: true),
        ),
        isTrue,
      );
    });
  });

  group('No checkout POST in plans API', () {
    test('freelancer_plans_api uses GET only', () {
      final src = File('lib/features/freelancer/data/freelancer_plans_api.dart').readAsStringSync();
      expect(src.contains('.post'), isFalse);
      expect(src.contains('subscriptions/checkout'), isFalse);
      expect(src.contains('confirm-checkout'), isFalse);
    });
  });
}
