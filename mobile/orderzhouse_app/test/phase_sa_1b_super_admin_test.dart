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
import 'package:orderzhouse_app/features/super_admin/data/super_admin_actions.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_api.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_controllers.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_models.dart';
import 'package:orderzhouse_app/features/super_admin/presentation/super_admin_action_dialogs.dart';
import 'package:orderzhouse_app/features/super_admin/presentation/super_admin_queue_screens.dart';

class FakeSuperAdminApi extends SuperAdminApi {
  FakeSuperAdminApi() : super(Dio());

  List<Map<String, dynamic>> kycItems = [];
  List<Map<String, dynamic>> activationItems = [];
  List<Map<String, dynamic>> claimItems = [];
  int approveCalls = 0;
  int claimStatusCalls = 0;
  final List<String> approvedIds = [];
  final List<Map<String, dynamic>> claimStatusPayloads = [];
  Completer<void>? approveGate;
  Completer<void>? claimGate;

  @override
  Future<dynamic> fetchHomeFast() async {
    return {
      'data': {
        'summary': {
          'attention': {
            'subscriptionsAwaitingActivation': activationItems.length,
            'financialClaimsPending': claimItems.length,
            'unreadNotifications': 0,
            'internalOrdersPendingClaims': 0,
          },
        },
      },
    };
  }

  @override
  Future<dynamic> fetchKycActivationRequests({
    String? status = 'pending_review',
    int page = 1,
    int limit = 50,
  }) async {
    return {
      'data': {
        'schemaReady': true,
        'items': kycItems,
        'total': kycItems.length,
      },
    };
  }

  @override
  Future<dynamic> fetchSuperAdminFeedback({String? status, int limit = 50, int offset = 0}) async {
    return {
      'data': {
        'items': [],
        'summary': {'new': 0},
      },
    };
  }

  @override
  Future<dynamic> fetchActivationQueue({int page = 1, int limit = 20}) async {
    return {
      'data': {
        'subscriptions': activationItems,
        'pagination': {'total': activationItems.length},
      },
    };
  }

  @override
  Future<dynamic> fetchPendingClaims() async {
    return {
      'data': {'claims': claimItems},
    };
  }

  @override
  Future<dynamic> fetchPantryRequests() async {
    return {
      'data': {'requests': []},
    };
  }

  @override
  Future<dynamic> fetchPantryDeliveries({String? status = 'submitted'}) async {
    return {
      'data': {'deliveries': []},
    };
  }

  @override
  Future<dynamic> fetchMarketplaceArticles({int limit = 50, int offset = 0}) async {
    return {
      'data': {'articles': []},
    };
  }

  @override
  Future<void> approveCompanyActivation(String subscriptionId, {String? overrideReason}) async {
    approveCalls++;
    approvedIds.add(subscriptionId);
    if (approveGate != null) await approveGate!.future;
    activationItems = activationItems.where((e) => '${e['id']}' != subscriptionId).toList();
  }

  @override
  Future<void> updateFinancialClaimStatus({
    required String claimId,
    required String status,
    String? adminNote,
  }) async {
    claimStatusCalls++;
    claimStatusPayloads.add({
      'claimId': claimId,
      'status': status,
      'adminNote': ?adminNote,
    });
    if (claimGate != null) await claimGate!.future;
    claimItems = claimItems.where((e) => '${e['id']}' != claimId).toList();
  }
}

Map<String, dynamic> _pendingActivation({
  String id = '10',
  String status = 'company_pending',
  String payment = 'paid',
  bool? needs,
}) {
  return {
    'id': id,
    'activationStatus': status,
    'paymentStatus': payment,
    'needsCompanyActivation': ?needs,
    'freelancer': {'firstName': 'ليث', 'familyName': 'تجربة', 'email': 'l@$id.test'},
    'plan': {'title': 'خطة', 'priceJod': 15},
  };
}

Map<String, dynamic> _pendingClaim({String id = '22', String status = 'pending'}) {
  return {
    'id': id,
    'requestTitle': 'مشروع تصميم',
    'status': status,
    'orderNumber': '1001',
    'totalPriceSnapshot': 25.5,
    'freelancer': {'firstName': 'أ', 'familyName': 'ب'},
  };
}

AppNotification _n({String? actionUrl, String? recipientRole}) {
  return AppNotification(
    id: '1',
    title: 'عنوان',
    message: 'رسالة',
    actionUrl: actionUrl,
    recipientRole: recipientRole,
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('activation eligibility', () {
    test('A2 enables in-app approve when pending', () {
      final item = SuperAdminActivationItem.fromJson(_pendingActivation());
      expect(wouldHaveBeenApprovableActivation(item), isTrue);
      expect(canApproveActivation(item), isTrue);
      expect(isMobileCompanyActivateDisabled(), isFalse);
    });

    test('already approved item has no approve action', () {
      final item = SuperAdminActivationItem.fromJson(
        _pendingActivation(status: 'company_approved'),
      );
      expect(wouldHaveBeenApprovableActivation(item), isFalse);
      expect(canApproveActivation(item), isFalse);
    });

    test('admin-assigned subscription is not approvable', () {
      final item = SuperAdminActivationItem.fromJson({
        ..._pendingActivation(),
        'source': 'admin',
        'assignedByUserId': '3',
        'paymentStatus': 'not_required',
        'notes': 'manual',
      });
      expect(wouldHaveBeenApprovableActivation(item), isFalse);
      expect(canApproveActivation(item), isFalse);
    });
  });

  group('claim status rules', () {
    test('pending claims allow accepted/rejected/frozen/in-person only', () {
      final item = SuperAdminClaimItem.fromJson(_pendingClaim());
      expect(canUpdatePendingClaimStatus(item), isTrue);
      expect(superAdminAllowedClaimStatusValues, isNot(contains('paid')));
      expect(isAllowedClaimStatusAction('paid'), isFalse);
      expect(isAllowedClaimStatusAction('accepted'), isTrue);
    });

    test('reject/freeze/in-person require a note of at least 3 characters', () {
      for (final status in ['rejected', 'frozen', 'requires_in_person_review']) {
        expect(claimStatusRequiresNote(status), isTrue);
        expect(validateClaimAdminNote(status: status, note: 'ab'), isNotNull);
        expect(validateClaimAdminNote(status: status, note: 'سبب كاف'), isNull);
        expect(canSubmitClaimStatusAction(status: status, note: 'ab'), isFalse);
        expect(canSubmitClaimStatusAction(status: status, note: 'سبب كاف'), isTrue);
      }
      expect(claimStatusRequiresNote('accepted'), isFalse);
      expect(canSubmitClaimStatusAction(status: 'accepted', note: ''), isTrue);
    });
  });

  group('in-flight guard', () {
    test('double start is rejected until end', () {
      final guard = SuperAdminInFlightGuard();
      expect(guard.tryStart('1'), isTrue);
      expect(guard.tryStart('1'), isFalse);
      expect(guard.tryStart('2'), isFalse);
      guard.end();
      expect(guard.tryStart('2'), isTrue);
    });
  });

  group('SuperAdminApi payloads', () {
    test('approve uses company-activate PATCH with optional overrideReason', () async {
      String? method;
      String? path;
      dynamic data;
      final dio = Dio(BaseOptions(baseUrl: 'http://test/api'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            method = options.method;
            path = options.path;
            data = options.data;
            handler.resolve(Response(requestOptions: options, data: {'success': true}));
          },
        ),
      );
      await SuperAdminApi(dio).approveCompanyActivation('44', overrideReason: 'سبب تجاوز');
      expect(method, 'PATCH');
      expect(path, '/admin/subscriptions/44/company-activate');
      expect(data, {'overrideReason': 'سبب تجاوز'});
    });

    test('claim status PATCH sends status and optional note only', () async {
      String? method;
      String? path;
      Map<String, dynamic>? data;
      final dio = Dio(BaseOptions(baseUrl: 'http://test/api'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            method = options.method;
            path = options.path;
            data = Map<String, dynamic>.from(options.data as Map);
            handler.resolve(Response(requestOptions: options, data: {'success': true}));
          },
        ),
      );
      await SuperAdminApi(dio).updateFinancialClaimStatus(
        claimId: '9',
        status: 'rejected',
        adminNote: 'سبب الرفض',
      );
      expect(method, 'PATCH');
      expect(path, '/super-admin/financial-claims/9/status');
      expect(data!.keys.toSet(), {'status', 'adminNote'});
      expect(data, isNot(contains('totalPriceSnapshot')));
      expect(data, isNot(contains('paymentMethod')));
      expect(data, isNot(contains('paidAt')));
    });
  });

  group('routing / security', () {
    test('Super Admin can stay on action screens', () {
      expect(
        superAdminRoleRedirect(location: AppRoutes.superAdminActivation, effectiveRole: 'super_admin'),
        isNull,
      );
      expect(
        superAdminRoleRedirect(location: AppRoutes.superAdminClaims, effectiveRole: 'super_admin'),
        isNull,
      );
    });

    test('client and freelancer cannot access Super Admin action routes', () {
      expect(
        superAdminRoleRedirect(location: AppRoutes.superAdminActivation, effectiveRole: 'client'),
        AppRoutes.home,
      );
      expect(
        superAdminRoleRedirect(location: AppRoutes.superAdminClaims, effectiveRole: 'freelancer'),
        AppRoutes.home,
      );
    });
  });

  group('notification resolver', () {
    test('maps activation and claims destinations for Super Admin', () {
      expect(
        resolveNotificationAction(
          _n(actionUrl: '/dashboard/super-admin/subscriptions/activation', recipientRole: 'super_admin'),
          currentUserRole: 'super_admin',
        )?.route,
        AppRoutes.superAdminActivation,
      );
      expect(
        resolveNotificationAction(
          _n(actionUrl: '/dashboard/super-admin/financial-claims', recipientRole: 'admin'),
          currentUserRole: 'super_admin',
        )?.route,
        AppRoutes.superAdminClaims,
      );
    });

    test('unknown Super Admin path falls back to Action Center, not a web URL', () {
      final target = resolveNotificationAction(
        _n(actionUrl: '/dashboard/super-admin/financial-center', recipientRole: 'super_admin'),
        currentUserRole: 'super_admin',
      );
      expect(target?.route, AppRoutes.home);
      expect(target?.showComingSoonMessage, isTrue);
      expect(target?.route, isNot(contains('dashboard')));
    });

    test('client/freelancer cannot follow Super Admin destinations', () {
      expect(
        resolveNotificationAction(
          _n(actionUrl: '/dashboard/super-admin/subscriptions/activation'),
          currentUserRole: 'client',
        ),
        isNull,
      );
      expect(
        resolveNotificationAction(
          _n(actionUrl: '/dashboard/super-admin/financial-claims'),
          currentUserRole: 'freelancer',
        ),
        isNull,
      );
    });
  });

  group('activation queue widgets', () {
    testWidgets('A2 shows actionable queue cards without web-only banner', (tester) async {
      tester.view.physicalSize = const Size(400, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final api = FakeSuperAdminApi()
        ..activationItems = [
          _pendingActivation(),
          _pendingActivation(id: '11', status: 'company_approved'),
        ];

      await tester.pumpWidget(
        ProviderScope(
          overrides: [superAdminApiProvider.overrideWithValue(api)],
          child: const MaterialApp(home: SuperAdminActivationQueueScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('sa-subscription-queue-10')), findsOneWidget);
      expect(find.textContaining('لوحة الويب'), findsNothing);
      expect(api.approveCalls, 0);
    });
  });

  group('claims queue widgets', () {
    testWidgets('status action opens confirmation dialog, note required, JOD only', (tester) async {
      tester.view.physicalSize = const Size(400, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final api = FakeSuperAdminApi()..claimItems = [_pendingClaim()];

      await tester.pumpWidget(
        ProviderScope(
          overrides: [superAdminApiProvider.overrideWithValue(api)],
          child: const MaterialApp(home: SuperAdminClaimsQueueScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('د.أ'), findsWidgets);
      expect(find.text('تسعير'), findsNothing);
      expect(find.text('صرف'), findsNothing);
      expect(find.textContaining('payout'), findsNothing);
      expect(find.textContaining('ledger'), findsNothing);

      await tester.tap(find.text(superAdminUpdateClaimStatusLabelAr));
      await tester.pumpAndSettle();
      expect(find.text(superAdminUpdateClaimStatusLabelAr), findsWidgets);
      expect(find.text('قبول'), findsOneWidget);
      expect(find.text('رفض'), findsOneWidget);
      expect(find.text('تجميد'), findsOneWidget);
      expect(find.text('مراجعة حضورية'), findsOneWidget);
      expect(find.text('مدفوعة'), findsNothing);

      await tester.tap(find.text('رفض'));
      await tester.pump();
      expect(find.byKey(superAdminClaimNoteFieldKey), findsOneWidget);
      expect(find.text(superAdminActionReasonLabelAr), findsOneWidget);

      await tester.enterText(find.byKey(superAdminClaimNoteFieldKey), 'أب');
      await tester.pump();
      final confirm = tester.widget<FilledButton>(find.byKey(superAdminConfirmClaimStatusButtonKey));
      expect(confirm.onPressed, isNull);
      expect(api.claimStatusCalls, 0);

      await tester.enterText(find.byKey(superAdminClaimNoteFieldKey), 'سبب كاف');
      await tester.pump();
      final enabled = tester.widget<FilledButton>(find.byKey(superAdminConfirmClaimStatusButtonKey));
      expect(enabled.onPressed, isNotNull);
    });

    testWidgets('double tap is guarded for claim status', (tester) async {
      tester.view.physicalSize = const Size(400, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final api = FakeSuperAdminApi()..claimItems = [_pendingClaim()];
      final gate = Completer<void>();
      api.claimGate = gate;

      await tester.pumpWidget(
        ProviderScope(
          overrides: [superAdminApiProvider.overrideWithValue(api)],
          child: const MaterialApp(home: SuperAdminClaimsQueueScreen()),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text(superAdminUpdateClaimStatusLabelAr));
      await tester.pumpAndSettle();
      await tester.tap(find.text('قبول'));
      await tester.pump();
      await tester.tap(find.byKey(superAdminConfirmClaimStatusButtonKey));
      await tester.pump();
      expect(api.claimStatusCalls, 1);

      final container = ProviderScope.containerOf(
        tester.element(find.byType(SuperAdminClaimsQueueScreen)),
      );
      final second = container.read(superAdminClaimsQueueProvider.notifier).updateStatus(
            claimId: '22',
            status: 'accepted',
          );
      expect(await second, isFalse);
      expect(api.claimStatusCalls, 1);

      gate.complete();
      await tester.pump();
      await tester.pump();
      expect(find.text(superAdminActionSuccessAr), findsOneWidget);
    });
  });

  group('source guards', () {
    test('Flutter Super Admin feature has no pricing/payout/ledger writes', () {
      final api = File('lib/features/super_admin/data/super_admin_api.dart').readAsStringSync();
      expect(api, contains('company-activate'));
      expect(api, contains('/super-admin/financial-claims/'));
      expect(api, contains('/status'));
      expect(api, isNot(contains('/pricing')));
      expect(api, isNot(contains('freelancer-payments')));
      expect(api, isNot(contains('financial-center')));
      expect(api, isNot(contains('debugPrint')));

      final queues = File('lib/features/super_admin/presentation/super_admin_queue_screens.dart').readAsStringSync();
      expect(queues, contains('superAdminActivationKycSectionAr'));
      expect(queues, contains('superAdminUpdateClaimStatusLabelAr'));
      expect(queues, contains('sa-kyc-queue-'));
      expect(queues, contains('sa-subscription-queue-'));
      expect(queues, isNot(contains('تسعير')));
      expect(queues, isNot(contains('صرف')));
      expect(queues, isNot(contains('approveDelivery')));
      expect(queues, isNot(contains('overrideReason')));

      final actions = File('lib/features/super_admin/data/super_admin_actions.dart').readAsStringSync();
      expect(actions, isNot(contains("status: 'paid'")));
      expect(superAdminAllowedClaimStatusValues.contains('paid'), isFalse);
    });
  });
}
