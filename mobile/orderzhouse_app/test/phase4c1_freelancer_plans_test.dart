import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/features/freelancer/data/freelancer_eligibility_models.dart';
import 'package:orderzhouse_app/features/freelancer/data/freelancer_plans_api.dart';
import 'package:orderzhouse_app/features/freelancer/data/freelancer_plans_models.dart';

void main() {
  group('PublicPlan parsing', () {
    test('parseListResponse reads plans array', () {
      final plans = PublicPlan.parseListResponse({
        'success': true,
        'data': {
          'plans': [
            {
              'id': '2',
              'checkoutPlanId': '2',
              'title': 'باقة المحترف',
              'durationDays': 365,
              'priceJod': 120,
              'orderValueMinJod': 50,
              'orderValueMaxJod': 500,
              'features': ['دعم أولوية', 'طلبات أكبر'],
              'isPopular': true,
            },
          ],
        },
      });
      expect(plans, hasLength(1));
      expect(plans.first.displayTitle, 'باقة المحترف');
      expect(plans.first.durationDays, 365);
      expect(plans.first.features, hasLength(2));
      expect(formatPlanPriceLabel(plans.first), '120 JOD');
    });
  });

  group('Subscription parsing', () {
    test('fromResponse parses subscription and activation fee', () {
      final bundle = FreelancerSubscriptionBundle.fromResponse({
        'success': true,
        'data': {
          'subscription': {
            'planId': '2',
            'status': 'active',
            'activationStatus': 'company_approved',
            'expiryDate': '2026-12-01T00:00:00.000Z',
            'plan': {
              'id': '2',
              'title': 'باقة المحترف',
              'durationDays': 365,
              'priceJod': 120,
            },
          },
          'activationFeeStatus': {
            'needsPayment': false,
            'isCurrent': true,
            'validUntil': '2026-06-01T00:00:00.000Z',
          },
        },
      });
      expect(bundle.subscription?.planId, '2');
      expect(bundle.subscription?.status, 'active');
      expect(bundle.activationFeeStatus?.isCurrent, isTrue);
      expect(freelancerSubscriptionStatusLabelAr(bundle.subscription?.status), 'نشط');
    });
  });

  group('Current plan detection', () {
    test('matches checkoutPlanId and planId', () {
      const plan = PublicPlan(
        id: '10',
        checkoutPlanId: '2',
        title: 'باقة',
      );
      const sub = FreelancerSubscriptionSnapshot(
        planId: '2',
        status: 'active',
      );
      expect(isCurrentPlanForSubscription(plan, sub), isTrue);
      expect(isCurrentPlanForSubscription(plan, const FreelancerSubscriptionSnapshot(planId: '9')), isFalse);
    });

    test('findPlanForSubscription returns matching plan', () {
      const plans = [
        PublicPlan(id: '1', checkoutPlanId: '1', title: 'مجانية'),
        PublicPlan(id: '2', checkoutPlanId: '2', title: 'مدفوعة'),
      ];
      const sub = FreelancerSubscriptionSnapshot(planId: '2');
      expect(findPlanForSubscription(plans, sub)?.displayTitle, 'مدفوعة');
    });
  });

  group('Eligibility display', () {
    test('maps known reason to neutral Arabic message without purchase CTA', () {
      const eligibility = FreelancerEligibility(eligible: false, reason: 'no_subscription');
      final message = freelancerEligibilityMessageAr(eligibility);
      expect(message, contains('مراجعة الإدارة'));
      expect(message, isNot(contains('باقات')));
      expect(message, isNot(contains('اشترك')));
    });
  });

  group('FreelancerPlansApi read-only', () {
    test('fetchPlans uses GET without body', () async {
      String? method;
      dynamic capturedData;
      final dio = Dio(BaseOptions(baseUrl: 'http://test'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            method = options.method;
            capturedData = options.data;
            handler.resolve(
              Response(
                requestOptions: options,
                data: {
                  'success': true,
                  'data': {
                    'plans': [
                      {'id': '1', 'checkoutPlanId': '1', 'title': 'مجانية'},
                    ],
                  },
                },
              ),
            );
          },
        ),
      );

      final api = FreelancerPlansApi(dio);
      final plans = await api.fetchPlans();
      expect(method, 'GET');
      expect(capturedData, isNull);
      expect(plans, hasLength(1));
    });

    test('fetchSubscription uses GET without identity payload', () async {
      dynamic capturedData;
      final dio = Dio(BaseOptions(baseUrl: 'http://test'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            capturedData = options.data;
            handler.resolve(
              Response(
                requestOptions: options,
                data: {
                  'success': true,
                  'data': {
                    'subscription': {'planId': '1', 'status': 'assigned_not_started'},
                    'activationFeeStatus': {'needsPayment': true, 'isCurrent': false},
                  },
                },
              ),
            );
          },
        ),
      );

      final api = FreelancerPlansApi(dio);
      final bundle = await api.fetchSubscription();
      expect(capturedData, isNull);
      expect(bundle.subscription?.planId, '1');
      expect(bundle.activationFeeStatus?.needsPayment, isTrue);
    });

    test('api has no checkout POST helpers', () {
      expect(FreelancerPlansApi(Dio()).runtimeType.toString(), 'FreelancerPlansApi');
      expect(
        FreelancerPlansApi(Dio()).runtimeType.toString().contains('checkout'),
        isFalse,
      );
    });
  });

  group('Checkout placeholder policy', () {
    test('order value range label formats min and max', () {
      expect(
        formatPlanOrderValueRangeLabel(minJod: 20, maxJod: 200),
        'قيمة الطلب: 20 – 200 دينار',
      );
    });
  });
}
