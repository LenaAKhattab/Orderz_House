import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orderzhouse_app/features/courses/data/course_access.dart';
import 'package:orderzhouse_app/features/courses/data/course_models.dart';
import 'package:orderzhouse_app/features/courses/presentation/course_details_screen.dart';
import 'package:orderzhouse_app/features/courses/presentation/courses_screen.dart';
import 'package:orderzhouse_app/features/freelancer/data/plan_upgrade_cta.dart';
import 'package:orderzhouse_app/features/freelancer/data/pool_order_participation_helpers.dart';
import 'package:orderzhouse_app/features/freelancer/presentation/plan_upgrade_required_cta.dart';
import 'package:orderzhouse_app/features/orders/data/pool_order_models.dart';
import 'package:orderzhouse_app/features/special_offer/data/special_offer_models.dart';
import 'package:orderzhouse_app/features/special_offer/presentation/special_offer_card.dart';
import 'package:orderzhouse_app/features/special_offer/presentation/special_offer_refund_modal.dart';

void main() {
  group('Course gating parity', () {
    test('parses isLockedByPlan and requiredTierCode', () {
      final course = FreelancerCourseSummary.fromJson({
        'id': '4',
        'title': 'دورة مقفلة',
        'isLockedByPlan': true,
        'canAccess': false,
        'requiredTierCode': 'silver',
        'upgradeRequired': true,
        'upgradePath': '/dashboard/freelancer/plans',
      });

      expect(course.isLockedByPlan, isTrue);
      expect(course.requiredTierCode, 'silver');
      expect(course.upgradeRequired, isTrue);
      expect(course.isAccessible, isFalse);
    });

    test('accessible course with canAccess=true remains open', () {
      final course = FreelancerCourseSummary.fromJson({
        'id': '8',
        'title': 'كيفية إنشاء مقال',
        'isLockedByPlan': false,
        'canAccess': true,
      });
      expect(course.isAccessible, isTrue);
    });

    testWidgets('locked course shows plan-lock copy and upgrade CTA', (tester) async {
      var opened = false;
      final course = FreelancerCourseSummary.fromJson({
        'id': '4',
        'title': 'دورة كتابة',
        'isLockedByPlan': true,
        'canAccess': false,
      });

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: FreelancerCourseCard(
              course: course,
              onOpen: () => opened = true,
            ),
          ),
        ),
      );

      expect(find.text(coursePlanLockMessageAr), findsOneWidget);
      expect(find.text(coursePlanLockCtaAr), findsOneWidget);
      await tester.tap(find.text('دورة كتابة'));
      await tester.pump();
      expect(opened, isFalse);
    });

    test('COURSE_PLAN_UPGRADE_REQUIRED maps to locked message', () {
      final err = DioException(
        requestOptions: RequestOptions(path: '/freelancer/courses/3'),
        response: Response(
          requestOptions: RequestOptions(path: '/freelancer/courses/3'),
          statusCode: 403,
          data: {'code': coursePlanUpgradeRequiredCode},
        ),
      );
      expect(mapCourseAccessErrorMessage(err), coursePlanLockMessageAr);
      expect(courseLockCtaForError(err), coursePlanLockCtaAr);
    });

    testWidgets('403 locked body uses plan upgrade copy', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: CourseLockedAccessBody(
              title: 'دورة',
              message: coursePlanLockMessageAr,
              ctaLabel: coursePlanLockCtaAr,
              onUpgrade: () {},
            ),
          ),
        ),
      );
      expect(find.text(coursePlanLockMessageAr), findsOneWidget);
      expect(find.text(coursePlanLockCtaAr), findsOneWidget);
    });
  });

  group('Pool order CTA parity', () {
    test('PLAN_TOO_LOW copy and upgrade button', () {
      final order = PoolOrder(
        id: '1',
        title: 'طلب',
        poolEligibility: const PoolPlanEligibility(
          isLockedByPlan: true,
          reasonCode: 'PLAN_TOO_LOW',
        ),
      );
      final props = poolOrderPlanUpgradeProps(order);
      expect(props, isNotNull);
      final copy = buildPlanUpgradeCopy(reason: props!.reason);
      expect(copy.headline, planTooLowHeadlineAr);
      expect(copy.button, planUpgradeButtonLabelAr);
    });

    test('NO_ACTIVE_PLAN shows view plans CTA', () {
      final order = PoolOrder(
        id: '2',
        title: 'طلب',
        poolEligibility: const PoolPlanEligibility(
          isLockedByPlan: true,
          reasonCode: 'NO_ACTIVE_PLAN',
        ),
      );
      final props = poolOrderPlanUpgradeProps(order);
      expect(props?.reason, 'NO_ACTIVE_PLAN');
      final copy = buildPlanUpgradeCopy(reason: props!.reason);
      expect(copy.headline, noActivePlanHeadlineAr);
      expect(copy.button, planUpgradeViewPlansButtonAr);
    });

    test('INTERNAL_PLAN_CONFIGURATION has support mode only', () {
      final order = PoolOrder(
        id: '3',
        title: 'طلب',
        poolEligibility: const PoolPlanEligibility(
          isLockedByPlan: true,
          reasonCode: 'INTERNAL_PLAN_CONFIGURATION',
          planConfigurationError: true,
        ),
      );
      final props = poolOrderPlanUpgradeProps(order);
      expect(props?.mode, PlanUpgradeCtaMode.support);
      final copy = buildPlanUpgradeCopy(reason: props!.reason);
      expect(copy.showButton, isFalse);
    });

    testWidgets('NO_ACTIVE_PLAN CTA widget renders button', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: PlanUpgradeRequiredCta(reason: 'NO_ACTIVE_PLAN'),
          ),
        ),
      );
      expect(find.text(noActivePlanHeadlineAr), findsOneWidget);
      expect(find.text(planUpgradeViewPlansButtonAr), findsOneWidget);
    });
  });

  group('Special offer parity', () {
    SpecialOfferPackage sampleOffer() {
      return SpecialOfferPackage.fromJson({
        'id': 'special_offer',
        'title': 'باقة العرض',
        'subtitle': 'عرض محدود',
        'priceJod': 100,
        'totalOffers': 240,
        'dailyLimit': 3,
        'durationDays': 180,
        'maxProjectValueJod': 20,
        'ctaLabel': 'احصل على العرض الآن',
        'refundExplanationAr': 'فقرة 1\n\nفقرة 2',
        'checkoutSupported': true,
      });
    }

    test('visible offer passes visibility check', () {
      expect(isSpecialOfferVisible(sampleOffer()), isTrue);
    });

    test('hidden offer fails visibility check', () {
      expect(isSpecialOfferVisible(null), isFalse);
      expect(
        isSpecialOfferVisible(
          SpecialOfferPackage.fromJson({
            'id': 'special_offer',
            'title': '',
            'priceJod': 100,
            'totalOffers': 0,
            'dailyLimit': 3,
            'durationDays': 180,
          }),
        ),
        isFalse,
      );
    });

    testWidgets('special offer card renders refund link', (tester) async {
      var refundOpened = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SpecialOfferCard(
              offer: sampleOffer(),
              onOpenPlans: () {},
              onOpenRefundDetails: () => refundOpened = true,
            ),
          ),
        ),
      );
      expect(find.byKey(const ValueKey('special-offer-card')), findsOneWidget);
      expect(find.text(specialOfferRefundLinkAr), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('special-offer-refund-link')));
      await tester.pump();
      expect(refundOpened, isTrue);
    });

    testWidgets('refund modal shows summary and sections', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) {
              return Scaffold(
                body: Center(
                  child: ElevatedButton(
                    onPressed: () => SpecialOfferRefundModal.show(context, sampleOffer()),
                    child: const Text('open'),
                  ),
                ),
              );
            },
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('special-offer-refund-modal')), findsOneWidget);
      expect(find.text(specialOfferRefundModalTitleAr), findsOneWidget);
      expect(find.text('عدد العروض'), findsOneWidget);
      expect(find.text('240 متاح'), findsOneWidget);
      expect(find.text('فقرة 1'), findsOneWidget);
    });
  });
}
