import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orderzhouse_app/features/notifications/data/notification_models.dart';
import 'package:orderzhouse_app/features/notifications/presentation/notification_tile.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_actions.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_kyc_models.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_models.dart';
import 'package:orderzhouse_app/features/super_admin/presentation/super_admin_ui.dart';

Map<String, dynamic> _kycPending({String id = '1'}) => {
      'id': id,
      'freelancerUserId': 'f$id',
      'status': 'pending_review',
      'freelancerName': 'سارة',
      'freelancerEmail': 's@x.com',
      'submittedAt': '2026-08-01T10:00:00Z',
    };

Map<String, dynamic> _paidSubscription({String id = '10'}) => {
      'id': id,
      'activationStatus': 'company_pending',
      'paymentStatus': 'paid',
      'needsCompanyActivation': true,
      'freelancer': {'firstName': 'ليث', 'familyName': 'تجربة', 'email': 'l@x.com'},
      'plan': {'title': 'فضي', 'priceJod': 15},
    };

Map<String, dynamic> _freeLegacySubscription({String id = '11'}) => {
      'id': id,
      'activationStatus': 'company_pending',
      'paymentStatus': 'paid',
      'needsCompanyActivation': true,
      'notes': 'auto_default_free_plan',
      'freelancer': {'firstName': 'مجاني', 'familyName': 'قديم', 'email': 'f@x.com'},
      'plan': {'name': 'orderzhouse_free', 'title': 'مجاني', 'priceJod': 0},
    };

void main() {
  group('A2.3 Action Center counts', () {
    test('initial home-fast state is refreshing, not subscriptionsAwaitingActivation', () {
      final snap = parseHomeFastSnapshot({
        'data': {
          'summary': {
            'attention': {'subscriptionsAwaitingActivation': 4027},
          },
        },
      });
      expect(snap.identityRequests, SuperAdminCountCard.refreshing);
      expect(snap.subscriptionActivations, SuperAdminCountCard.refreshing);
      expect(snap.identityRequests.count, isNull);
      expect(snap.subscriptionActivations.count, isNull);
    });

    test('identity and subscription enrichment counts are parsed separately', () {
      final kyc = [
        SuperAdminKycActivationItem.fromJson(_kycPending(id: '1')),
        SuperAdminKycActivationItem.fromJson(_kycPending(id: '2')),
      ];
      final subs = [
        SuperAdminActivationItem.fromJson(_paidSubscription()),
        SuperAdminActivationItem.fromJson(_freeLegacySubscription()),
      ];
      expect(identityActionableCount(kyc), 2);
      expect(subscriptionActionableCount(subs), 1);
      expect(identityActionableCount(kyc), isNot(subscriptionActionableCount(subs)));
    });

    test('free/Starter legacy rows are not paid activation', () {
      final classified = classifySubscriptionActivationItems([
        SuperAdminActivationItem.fromJson(_paidSubscription()),
        SuperAdminActivationItem.fromJson(_freeLegacySubscription()),
        SuperAdminActivationItem.fromJson({
          ..._paidSubscription(id: '12'),
          'plan': {'name': 'starter', 'title': 'Starter', 'priceJod': 0},
          'notes': 'auto_default_free_plan',
        }),
      ]);
      expect(classified.paidActionable, hasLength(1));
      expect(classified.legacyFree.length, greaterThanOrEqualTo(2));
    });

    testWidgets('pending count tile shows placeholder instead of misleading number', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SuperAdminCountTile(
              title: 'توثيق',
              card: SuperAdminCountCard.refreshing,
              icon: Icons.verified_user_outlined,
            ),
          ),
        ),
      );
      expect(find.text('…'), findsOneWidget);
      expect(find.text('جارٍ التحديث'), findsOneWidget);
      expect(find.text('4027'), findsNothing);
    });
  });

  group('A2.3 subscription activation stability', () {
    test('paid queue classification renders actionable rows', () {
      final classified = classifySubscriptionActivationItems([
        SuperAdminActivationItem.fromJson(_paidSubscription()),
      ]);
      expect(classified.paidActionable, hasLength(1));
      expect(classified.isEmpty, isFalse);
    });

    test('empty paid queue when only legacy rows exist', () {
      final classified = classifySubscriptionActivationItems([
        SuperAdminActivationItem.fromJson(_freeLegacySubscription()),
      ]);
      expect(classified.paidActionable, isEmpty);
      expect(classified.legacyFree, hasLength(1));
    });

    test('malformed optional subscription fields do not crash parser', () {
      expect(
        () => SuperAdminActivationItem.fromJson({
          'id': 'x',
          'plan': 'not-a-map',
          'freelancer': null,
        }),
        returnsNormally,
      );
      final item = SuperAdminActivationItem.fromJson({
        'id': 'x',
        'plan': 'not-a-map',
        'freelancer': null,
      });
      expect(item.id, 'x');
      expect(isPaidSubscriptionActivationActionable(item), isFalse);
    });

    test('partial queue load keeps subscription data when KYC fails', () {
      final snap = SuperAdminActivationQueueSnapshot(
        kycItems: const [],
        subscriptionItems: [SuperAdminActivationItem.fromJson(_paidSubscription())],
        kycLoadFailed: true,
      );
      expect(snap.kycLoadFailed, isTrue);
      expect(snap.subscriptionLoadFailed, isFalse);
      expect(snap.subscriptionItems, isNotEmpty);
      expect(snap.pendingPaidSubscriptionCount, 1);
    });
  });

  group('A2.3 identity queue stability', () {
    test('identity actionable count ignores non-pending rows', () {
      final items = [
        SuperAdminKycActivationItem.fromJson(_kycPending()),
        SuperAdminKycActivationItem.fromJson({..._kycPending(id: '9'), 'status': 'approved'}),
      ];
      expect(identityActionableCount(items), 1);
    });

    test('KYC list parse tolerates missing optional document flags', () {
      final parsed = parseKycActivationList({
        'data': {
          'schemaReady': true,
          'items': [_kycPending()],
        },
      });
      expect(parsed.items, hasLength(1));
      expect(parsed.items.single.isPendingReview, isTrue);
    });
  });

  group('A2.3 notifications selection UX', () {
    const notification = AppNotification(
      id: 'n1',
      title: 'عنوان',
      message: 'نص الإشعار',
    );

    testWidgets('checkbox toggles selection without row onTap', (tester) async {
      var selected = false;
      var rowTapped = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: NotificationTile(
              notification: notification,
              selected: selected,
              onSelectedChanged: (value) => selected = value,
              onTap: () => rowTapped = true,
            ),
          ),
        ),
      );

      await tester.tap(find.byType(Checkbox));
      await tester.pump();
      expect(selected, isTrue);
      expect(rowTapped, isFalse);
    });

    testWidgets('row tap opens detail only when callback provided and not selecting', (tester) async {
      var rowTapped = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: NotificationTile(
              notification: notification,
              onTap: () => rowTapped = true,
            ),
          ),
        ),
      );

      await tester.tap(find.text('عنوان'));
      await tester.pump();
      expect(rowTapped, isTrue);
    });

    testWidgets('selection mode hides عرض التفاصيل hint', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: NotificationTile(
              notification: notification,
              selectionMode: true,
              onSelectedChanged: _noop,
              onTap: () {},
            ),
          ),
        ),
      );
      expect(find.text('عرض التفاصيل'), findsNothing);
    });
  });
}

void _noop(bool _) {}
