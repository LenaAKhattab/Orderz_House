import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orderzhouse_app/core/config/environment_config.dart';
import 'package:orderzhouse_app/features/freelancer/data/plan_upgrade_cta.dart';
import 'package:orderzhouse_app/features/freelancer/data/pool_order_participation_helpers.dart';
import 'package:orderzhouse_app/features/freelancer/presentation/plan_upgrade_required_cta.dart';
import 'package:orderzhouse_app/features/orders/data/pool_order_models.dart';

void main() {
  group('Pool list CTA polish', () {
    testWidgets('PLAN_TOO_LOW list CTA shows helper + ترقية الباقة', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: PlanUpgradeRequiredCta(
              reason: 'PLAN_TOO_LOW',
              compact: true,
            ),
          ),
        ),
      );
      expect(find.text(planTooLowHeadlineAr), findsOneWidget);
      expect(find.text(planUpgradeButtonLabelAr), findsOneWidget);
      expect(find.text('يتطلب ترقية الباقة'), findsNothing);
    });

    testWidgets('NO_ACTIVE_PLAN list CTA shows helper + عرض الباقات', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: PlanUpgradeRequiredCta(
              reason: 'NO_ACTIVE_PLAN',
              compact: true,
            ),
          ),
        ),
      );
      expect(find.text(noActivePlanHeadlineAr), findsOneWidget);
      expect(find.text(planUpgradeViewPlansButtonAr), findsOneWidget);
    });

    testWidgets('INTERNAL_PLAN_CONFIGURATION has message only', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: PlanUpgradeRequiredCta(
              reason: 'INTERNAL_PLAN_CONFIGURATION',
              compact: true,
            ),
          ),
        ),
      );
      expect(find.text(internalPlanConfigHeadlineAr), findsOneWidget);
      expect(find.text(planUpgradeButtonLabelAr), findsNothing);
      expect(find.text(planUpgradeViewPlansButtonAr), findsNothing);
    });

    test('locked list copy comes from order helpers', () {
      final planTooLow = PoolOrder(
        id: '1',
        title: 'طلب',
        poolEligibility: const PoolPlanEligibility(
          isLockedByPlan: true,
          reasonCode: 'PLAN_TOO_LOW',
        ),
      );
      expect(poolPlanLockUserMessage(planTooLow), planTooLowHeadlineAr);
      expect(poolOrderPlanUpgradeProps(planTooLow)?.reason, 'PLAN_TOO_LOW');

      final noPlan = PoolOrder(
        id: '2',
        title: 'طلب',
        poolEligibility: const PoolPlanEligibility(
          isLockedByPlan: true,
          reasonCode: 'NO_ACTIVE_PLAN',
        ),
      );
      expect(poolPlanLockUserMessage(noPlan), noActivePlanHeadlineAr);
      expect(
        buildPlanUpgradeCopy(reason: poolOrderPlanUpgradeProps(noPlan)!.reason).button,
        planUpgradeViewPlansButtonAr,
      );

      final internal = PoolOrder(
        id: '3',
        title: 'طلب',
        poolEligibility: const PoolPlanEligibility(
          isLockedByPlan: true,
          reasonCode: 'INTERNAL_PLAN_CONFIGURATION',
          planConfigurationError: true,
        ),
      );
      expect(poolPlanLockUserMessage(internal), internalPlanConfigHeadlineAr);
      expect(poolOrderPlanUpgradeProps(internal)?.mode, PlanUpgradeCtaMode.support);
      expect(
        buildPlanUpgradeCopy(reason: poolOrderPlanUpgradeProps(internal)!.reason).showButton,
        isFalse,
      );
    });

    test('marketplace source no longer hardcodes short upgrade pill', () {
      final source = File(
        'lib/features/orders/presentation/orders_marketplace_screen.dart',
      ).readAsStringSync();
      expect(source.contains('يتطلب ترقية الباقة'), isFalse);
      expect(source.contains('PlanUpgradeRequiredCta'), isTrue);
      expect(source.contains('isPoolOrderLockedByPlan'), isTrue);
    });
  });

  group('Release environment guards', () {
    test('release API resolves to production when no overrides', () {
      expect(
        EnvironmentConfig.resolveApiBaseUrl(
          dartDefine: '',
          dotEnvValue: 'http://localhost:5000/api',
          isRelease: true,
          isAndroid: true,
        ),
        EnvironmentConfig.productionApiBaseUrl,
      );
      expect(EnvironmentConfig.productionApiBaseUrl, 'https://orderzhouse.com/api');
    });

    test('release rejects localhost dart-define and falls back to production', () {
      expect(
        EnvironmentConfig.resolveApiBaseUrl(
          dartDefine: 'http://10.0.2.2:5000/api',
          isRelease: true,
          isAndroid: true,
        ),
        EnvironmentConfig.productionApiBaseUrl,
      );
    });

    test('debug can still use dart-define for production QA', () {
      expect(
        EnvironmentConfig.resolveApiBaseUrl(
          dartDefine: 'https://orderzhouse.com/api',
          isRelease: false,
          isAndroid: true,
        ),
        'https://orderzhouse.com/api',
      );
    });
  });
}
