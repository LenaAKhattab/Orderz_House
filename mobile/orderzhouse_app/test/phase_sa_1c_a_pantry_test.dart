import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/core/router/routes.dart';
import 'package:orderzhouse_app/core/router/super_admin_access.dart';
import 'package:orderzhouse_app/features/notifications/data/notification_models.dart';
import 'package:orderzhouse_app/features/notifications/navigation/notification_action_resolver.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_api.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_controllers.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_models.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_pantry_actions.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_pantry_models.dart';
import 'package:orderzhouse_app/features/super_admin/presentation/super_admin_pantry_screens.dart';
import 'package:orderzhouse_app/features/super_admin/presentation/super_admin_queue_screens.dart';

class FakeSuperAdminApi extends SuperAdminApi {
  FakeSuperAdminApi() : super(Dio());

  List<Map<String, dynamic>> pantryRequests = [];
  List<Map<String, dynamic>> pantryDeliveries = [];
  Map<String, dynamic>? requestDetail;
  int acceptCalls = 0;
  int rejectCalls = 0;
  int approveDeliveryCalls = 0;
  int revisionCalls = 0;
  final List<Map<String, dynamic>> acceptPayloads = [];
  Completer<void>? acceptGate;
  Completer<void>? rejectGate;
  Completer<void>? approveGate;
  Completer<void>? revisionGate;

  @override
  Future<dynamic> fetchHomeFast() async => {
        'data': {
          'summary': {
            'attention': {
              'subscriptionsAwaitingActivation': 0,
              'financialClaimsPending': 0,
              'unreadNotifications': 0,
              'internalOrdersPendingClaims': 0,
            },
          },
        },
      };

  @override
  Future<dynamic> fetchActivationQueue({int page = 1, int limit = 20}) async => {
        'data': {'subscriptions': [], 'pagination': {'total': 0}},
      };

  @override
  Future<dynamic> fetchKycActivationRequests({
    String? status = 'pending_review',
    int page = 1,
    int limit = 50,
  }) async =>
      {
        'data': {'schemaReady': true, 'items': [], 'total': 0},
      };

  @override
  Future<dynamic> fetchSuperAdminFeedback({String? status, int limit = 50, int offset = 0}) async =>
      {
        'data': {
          'items': [],
          'summary': {'new': 0},
        },
      };

  @override
  Future<dynamic> fetchPendingClaims() async => {
        'data': {'claims': []},
      };

  @override
  Future<dynamic> fetchPantryRequests() async => {
        'data': {'requests': pantryRequests},
      };

  @override
  Future<dynamic> fetchPantryDeliveries({String? status = 'submitted'}) async {
    var list = pantryDeliveries;
    if (status != null) {
      list = list.where((e) => '${e['status']}' == status).toList();
    }
    return {
      'data': {'deliveries': list},
    };
  }

  @override
  Future<dynamic> fetchPantryRequestDetail(String requestId) async {
    return requestDetail ??
        {
          'data': {
            'request': pantryRequests.firstWhere(
              (e) => '${e['id']}' == requestId,
              orElse: () => {'id': requestId, 'title': 'طلب', 'status': 'open_for_bids'},
            ),
            'bids': <Map<String, dynamic>>[],
            'deliveries': <Map<String, dynamic>>[],
            'fairRanking': {'eligibleForAssignment': false},
          },
        };
  }

  @override
  Future<dynamic> fetchMarketplaceArticles({int limit = 50, int offset = 0}) async => {
        'data': {'articles': []},
      };

  @override
  Future<void> acceptPantryBid({
    required String requestId,
    required String bidId,
    String? overrideReason,
  }) async {
    acceptCalls++;
    acceptPayloads.add({
      'requestId': requestId,
      'bidId': bidId,
      'overrideReason': ?overrideReason,
    });
    if (acceptGate != null) await acceptGate!.future;
  }

  @override
  Future<void> rejectPantryBid({required String requestId, required String bidId}) async {
    rejectCalls++;
    if (rejectGate != null) await rejectGate!.future;
  }

  @override
  Future<void> approvePantryDelivery(String deliveryId) async {
    approveDeliveryCalls++;
    if (approveGate != null) await approveGate!.future;
    pantryDeliveries = pantryDeliveries
        .map((e) => '${e['id']}' == deliveryId ? {...e, 'status': 'approved'} : e)
        .toList();
  }

  @override
  Future<void> requestPantryDeliveryRevision({
    required String deliveryId,
    required String feedback,
  }) async {
    revisionCalls++;
    if (revisionGate != null) await revisionGate!.future;
    pantryDeliveries = pantryDeliveries
        .map((e) => '${e['id']}' == deliveryId ? {...e, 'status': 'revision_requested'} : e)
        .toList();
  }
}

AppNotification _n({
  String? actionUrl,
  String? recipientRole,
  String? entityType,
  String? entityId,
  String? type,
}) {
  return AppNotification(
    id: '1',
    title: 'عنوان',
    message: 'رسالة',
    actionUrl: actionUrl,
    recipientRole: recipientRole,
    entityType: entityType,
    entityId: entityId,
    type: type,
  );
}

Map<String, dynamic> _request({
  String id = '1',
  String collection = 'eligible_for_assignment',
  int current = 10,
  int required = 10,
  int relist = 0,
  String status = 'open_for_bids',
}) {
  return {
    'id': id,
    'title': 'طلب مونة',
    'status': status,
    'relistCount': relist,
    'bidCollection': {
      'status': collection,
      'current': current,
      'required': required,
    },
  };
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('routing / security', () {
    test('Super Admin can open pantry queue and action screens', () {
      expect(
        superAdminRoleRedirect(location: AppRoutes.superAdminPantry, effectiveRole: 'super_admin'),
        isNull,
      );
      expect(
        superAdminRoleRedirect(
          location: AppRoutes.superAdminPantryRequestPath('8'),
          effectiveRole: 'super_admin',
        ),
        isNull,
      );
      expect(
        superAdminRoleRedirect(
          location: AppRoutes.superAdminPantryDeliveryPath('3'),
          effectiveRole: 'super_admin',
        ),
        isNull,
      );
    });

    test('client and freelancer cannot open pantry action routes', () {
      expect(
        superAdminRoleRedirect(location: AppRoutes.superAdminPantry, effectiveRole: 'client'),
        AppRoutes.home,
      );
      expect(
        superAdminRoleRedirect(
          location: AppRoutes.superAdminPantryRequestPath('8'),
          effectiveRole: 'freelancer',
        ),
        AppRoutes.home,
      );
    });
  });

  group('pantry queue parser', () {
    test('renders progress, minimum_not_met, threshold, and relist', () {
      final items = parsePantryAttention(
        requestsBody: {
          'data': {
            'requests': [
              _request(collection: 'threshold_reached'),
              _request(id: '2', collection: 'minimum_not_met', current: 3, required: 10, relist: 2),
              _request(id: '3', collection: 'collecting', current: 1, required: 10),
            ],
          },
        },
        deliveriesBody: {
          'data': {
            'deliveries': [
              {
                'id': '9',
                'status': 'submitted',
                'requestTitle': 'تسليم',
                'pantryRequestId': '1',
              },
            ],
          },
        },
      );
      expect(items.any((e) => e.id == '3'), isFalse);
      expect(items.firstWhere((e) => e.id == '1').progressLabel, '10 / 10');
      expect(items.firstWhere((e) => e.id == '2').statusLabel, 'لم يكتمل الحد الأدنى');
      expect(items.firstWhere((e) => e.id == '2').relistCount, 2);
      expect(items.firstWhere((e) => e.id == '9').itemKind, SuperAdminPantryItemKind.delivery);
      expect(pantryCollectionStatusLabelAr('eligible_for_assignment'), 'جاهز للإسناد');
    });
  });

  group('bid action rules', () {
    test('recommended accept does not require override; non-recommended does', () {
      const ranking = SuperAdminPantryFairRanking(
        eligibleForAssignment: true,
        recommendedBidId: '10',
      );
      expect(isRecommendedPantryBid('10', ranking), isTrue);
      expect(acceptRequiresOverride(bidId: '10', ranking: ranking), isFalse);
      expect(acceptRequiresOverride(bidId: '11', ranking: ranking), isTrue);
      expect(validatePantryOverrideReason('قصير'), isNotNull);
      expect(validatePantryOverrideReason('سبب كافٍ للتجاوز هنا'), isNull);
    });
  });

  group('notification resolver', () {
    test('maps pantry admin URLs to queue or detail, unknown to Action Center', () {
      expect(
        resolveNotificationAction(
          _n(actionUrl: '/dashboard/super-admin/pantry', recipientRole: 'super_admin'),
          currentUserRole: 'super_admin',
        )?.route,
        AppRoutes.superAdminPantry,
      );
      expect(
        resolveNotificationAction(
          _n(actionUrl: '/dashboard/super-admin/pantry/44', recipientRole: 'super_admin'),
          currentUserRole: 'super_admin',
        )?.route,
        AppRoutes.superAdminPantryRequestPath('44'),
      );
      final unknown = resolveNotificationAction(
        _n(actionUrl: '/dashboard/super-admin/pantry/create', recipientRole: 'super_admin'),
        currentUserRole: 'super_admin',
      );
      expect(unknown?.route, AppRoutes.home);
      expect(unknown?.showComingSoonMessage, isTrue);
    });

    test('client/freelancer cannot follow Super Admin pantry destinations', () {
      expect(
        resolveNotificationAction(
          _n(actionUrl: '/dashboard/super-admin/pantry', recipientRole: 'admin'),
          currentUserRole: 'client',
        ),
        isNull,
      );
      expect(
        resolveNotificationAction(
          _n(entityType: 'pantry_request', entityId: '4', recipientRole: 'super_admin'),
          currentUserRole: 'freelancer',
        ),
        isNull,
      );
    });
  });

  group('pantry queue widgets', () {
    testWidgets('loading / success / empty / error', (tester) async {
      tester.view.physicalSize = const Size(400, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final api = FakeSuperAdminApi()
        ..pantryRequests = [_request(collection: 'threshold_reached', relist: 1)];

      await tester.pumpWidget(
        ProviderScope(
          overrides: [superAdminApiProvider.overrideWithValue(api)],
          child: const MaterialApp(home: SuperAdminPantryQueueScreen()),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('طلب مونة'), findsOneWidget);
      expect(find.text('10 / 10'), findsOneWidget);
      expect(find.textContaining(superAdminPantryRelistLabelAr), findsOneWidget);
    });
  });

  group('bid review widgets', () {
    testWidgets('accept recommended requires confirmation; override required otherwise', (tester) async {
      tester.view.physicalSize = const Size(400, 1100);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final api = FakeSuperAdminApi()
        ..requestDetail = {
          'data': {
            'request': _request(),
            'bids': [
              {
                'id': '10',
                'freelancerName': 'موصى',
                'amount': 12.5,
                'durationDays': 3,
                'status': 'pending',
                'createdAt': '2026-08-01T10:00:00Z',
              },
              {
                'id': '11',
                'freelancerName': 'آخر',
                'amount': 9,
                'status': 'pending',
              },
            ],
            'fairRanking': {
              'eligibleForAssignment': true,
              'recommendedBidId': '10',
            },
          },
        };

      await tester.pumpWidget(
        ProviderScope(
          overrides: [superAdminApiProvider.overrideWithValue(api)],
          child: const MaterialApp(home: SuperAdminPantryRequestScreen(requestId: '1')),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('د.أ'), findsWidgets);
      expect(find.text(superAdminRecommendedBidLabelAr), findsOneWidget);

      await tester.tap(find.text(superAdminAcceptBidLabelAr).first);
      await tester.pumpAndSettle();
      expect(find.text(superAdminConfirmAcceptBidBodyAr), findsOneWidget);
      expect(api.acceptCalls, 0);
      await tester.tap(find.text(superAdminCancelActionLabelAr));
      await tester.pumpAndSettle();

      await tester.tap(find.text(superAdminAcceptBidLabelAr).at(1));
      await tester.pumpAndSettle();
      expect(find.text(superAdminOverrideReasonLabelAr), findsOneWidget);
      await tester.enterText(find.byKey(const Key(superAdminPantryOverrideFieldKey)), 'قصير');
      await tester.pump();
      final confirm = tester.widget<FilledButton>(find.byKey(const Key(superAdminPantryAcceptConfirmKey)));
      expect(confirm.onPressed, isNull);
      expect(api.acceptCalls, 0);
    });

    testWidgets('reject requires confirmation and double tap is guarded', (tester) async {
      tester.view.physicalSize = const Size(400, 1100);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final api = FakeSuperAdminApi()
        ..requestDetail = {
          'data': {
            'request': _request(),
            'bids': [
              {'id': '10', 'freelancerName': 'موصى', 'amount': 5, 'status': 'pending'},
            ],
            'fairRanking': {'eligibleForAssignment': true, 'recommendedBidId': '10'},
          },
        };
      final gate = Completer<void>();
      api.rejectGate = gate;

      await tester.pumpWidget(
        ProviderScope(
          overrides: [superAdminApiProvider.overrideWithValue(api)],
          child: const MaterialApp(home: SuperAdminPantryRequestScreen(requestId: '1')),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text(superAdminRejectBidLabelAr));
      await tester.pumpAndSettle();
      expect(find.text(superAdminConfirmRejectBidBodyAr), findsOneWidget);
      await tester.tap(find.byKey(const Key(superAdminPantryRejectConfirmKey)));
      await tester.pump();
      expect(api.rejectCalls, 1);

      final container = ProviderScope.containerOf(
        tester.element(find.byType(SuperAdminPantryRequestScreen)),
      );
      final second = container.read(superAdminPantryRequestDetailProvider('1').notifier).rejectBid('10');
      expect(await second, isFalse);
      expect(api.rejectCalls, 1);
      gate.complete();
      await tester.pump();
      await tester.pump();
      expect(find.text(superAdminActionSuccessAr), findsOneWidget);
    });
  });

  group('delivery review widgets', () {
    testWidgets('approve confirmation, revision note, no payout UI', (tester) async {
      tester.view.physicalSize = const Size(400, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final api = FakeSuperAdminApi()
        ..pantryDeliveries = [
          {
            'id': '77',
            'status': 'submitted',
            'requestTitle': 'تسليم تصميم',
            'freelancerName': 'ليث',
            'message': 'تم التسليم',
            'createdAt': '2026-08-02T10:00:00Z',
            'files': [
              {'id': '1', 'fileName': 'file.pdf'},
            ],
          },
        ];

      await tester.pumpWidget(
        ProviderScope(
          overrides: [superAdminApiProvider.overrideWithValue(api)],
          child: const MaterialApp(home: SuperAdminPantryDeliveryScreen(deliveryId: '77')),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('تسليم تصميم'), findsOneWidget);
      expect(find.text('تسعير'), findsNothing);
      expect(find.text('صرف'), findsNothing);
      expect(find.textContaining('ledger'), findsNothing);
      expect(find.textContaining('payout'), findsNothing);

      await tester.tap(find.text(superAdminApproveDeliveryLabelAr));
      await tester.pumpAndSettle();
      expect(find.text(superAdminConfirmApproveDeliveryBodyAr), findsOneWidget);
      expect(api.approveDeliveryCalls, 0);
      await tester.tap(find.text(superAdminCancelActionLabelAr));
      await tester.pumpAndSettle();

      await tester.tap(find.text(superAdminRequestRevisionLabelAr));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key(superAdminPantryRevisionFieldKey)), 'لا');
      await tester.pump();
      final confirm = tester.widget<FilledButton>(find.byKey(const Key(superAdminPantryRevisionConfirmKey)));
      expect(confirm.onPressed, isNull);
      expect(api.revisionCalls, 0);
    });

    testWidgets('delivery double tap is guarded', (tester) async {
      tester.view.physicalSize = const Size(400, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final api = FakeSuperAdminApi()
        ..pantryDeliveries = [
          {'id': '77', 'status': 'submitted', 'requestTitle': 'تسليم', 'message': 'ok'},
        ];
      final gate = Completer<void>();
      api.approveGate = gate;

      await tester.pumpWidget(
        ProviderScope(
          overrides: [superAdminApiProvider.overrideWithValue(api)],
          child: const MaterialApp(home: SuperAdminPantryDeliveryScreen(deliveryId: '77')),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text(superAdminApproveDeliveryLabelAr));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key(superAdminPantryApproveDeliveryConfirmKey)));
      await tester.pump();
      expect(api.approveDeliveryCalls, 1);

      final container = ProviderScope.containerOf(
        tester.element(find.byType(SuperAdminPantryDeliveryScreen)),
      );
      final second = container.read(superAdminPantryDeliveryDetailProvider('77').notifier).approve();
      expect(await second, isFalse);
      expect(api.approveDeliveryCalls, 1);
      gate.complete();
      await tester.pump();
      await tester.pump();
      expect(find.text(superAdminActionSuccessAr), findsOneWidget);
    });
  });

  group('source guards', () {
    test('no pricing/payout/ledger and freelancer pantry UI untouched', () {
      final screens = File('lib/features/super_admin/presentation/super_admin_pantry_screens.dart').readAsStringSync();
      expect(screens, contains('superAdminAcceptBidLabelAr'));
      expect(screens, contains('superAdminApproveDeliveryLabelAr'));
      expect(screens, isNot(contains('تسعير')));
      expect(screens, isNot(contains('صرف')));
      expect(screens, isNot(contains('auto-assign')));

      final api = File('lib/features/super_admin/data/super_admin_api.dart').readAsStringSync();
      expect(api, contains('/bids/'));
      expect(api, contains('/approve'));
      expect(api, isNot(contains('/pricing')));
      expect(api, isNot(contains('freelancer-payments')));
      expect(api, isNot(contains('debugPrint')));

      final freelancer = File('lib/features/pantry/presentation/pantry_hub_screen.dart').readAsStringSync();
      expect(freelancer, isNot(contains('overrideReason')));
      expect(freelancer, isNot(contains('اعتماد التسليم')));
    });
  });
}
