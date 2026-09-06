import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:orderzhouse_app/core/router/routes.dart';
import 'package:orderzhouse_app/core/router/super_admin_access.dart';
import 'package:orderzhouse_app/features/notifications/data/notification_models.dart';
import 'package:orderzhouse_app/features/notifications/navigation/notification_action_resolver.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_actions.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_api.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_controllers.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_kyc_models.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_models.dart';
import 'package:orderzhouse_app/features/super_admin/presentation/super_admin_action_center_screen.dart';
import 'package:orderzhouse_app/features/super_admin/presentation/super_admin_action_dialogs.dart';
import 'package:orderzhouse_app/features/super_admin/presentation/super_admin_activation_screens.dart';
import 'package:orderzhouse_app/features/super_admin/presentation/super_admin_queue_screens.dart';

class A2FakeSuperAdminApi extends SuperAdminApi {
  A2FakeSuperAdminApi() : super(Dio());

  List<Map<String, dynamic>> kycItems = [];
  List<Map<String, dynamic>> activationItems = [];
  int kycApproveCalls = 0;
  int kycRejectCalls = 0;
  int subscriptionApproveCalls = 0;
  Completer<void>? actionGate;

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
  Future<dynamic> fetchKycActivationRequestDetail(String requestId) async {
    final item = kycItems.firstWhere(
      (e) => '${e['id']}' == requestId,
      orElse: () => <String, dynamic>{},
    );
    return {
      'data': {
        'request': item,
        'freelancer': {
          'id': 'f1',
          'name': item['freelancerName'] ?? 'مستقل',
          'email': item['freelancerEmail'] ?? 'x@test.com',
        },
        'files': {
          if (item['hasFrontImage'] == true) 'front': {'mimeType': 'image/jpeg'},
          if (item['hasBackImage'] == true) 'back': {'mimeType': 'image/jpeg'},
        },
      },
    };
  }

  static final List<int> _tinyPng = <int>[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82,
  ];

  @override
  Future<List<int>> fetchKycActivationFileBytes({
    required String requestId,
    required String side,
  }) async {
    return List<int>.from(_tinyPng);
  }

  @override
  Future<void> approveKycActivationRequest(String requestId) async {
    kycApproveCalls++;
    if (actionGate != null) await actionGate!.future;
    kycItems = kycItems.where((e) => '${e['id']}' != requestId).toList();
  }

  @override
  Future<void> rejectKycActivationRequest({
    required String requestId,
    required String rejectionReason,
    String? adminNotes,
  }) async {
    kycRejectCalls++;
    if (actionGate != null) await actionGate!.future;
    kycItems = kycItems.where((e) => '${e['id']}' != requestId).toList();
  }

  @override
  Future<void> approveCompanyActivation(String subscriptionId, {String? overrideReason}) async {
    subscriptionApproveCalls++;
    if (actionGate != null) await actionGate!.future;
    activationItems = activationItems.where((e) => '${e['id']}' != subscriptionId).toList();
  }
}

Map<String, dynamic> _kycPending({String id = '7'}) => {
      'id': id,
      'freelancerUserId': 'f$id',
      'status': 'pending_review',
      'freelancerName': 'سارة',
      'freelancerEmail': 's@x.com',
      'submittedAt': '2026-08-01T10:00:00Z',
      'hasFrontImage': true,
      'hasBackImage': false,
    };

Map<String, dynamic> _subscriptionPending({String id = '10'}) => {
      'id': id,
      'activationStatus': 'company_pending',
      'paymentStatus': 'paid',
      'needsCompanyActivation': true,
      'freelancer': {'firstName': 'ليث', 'familyName': 'تجربة', 'email': 'l@x.com'},
      'plan': {'title': 'فضي', 'priceJod': 15},
    };

AppNotification _n({String? actionUrl, String? entityType, String? entityId, String? type}) {
  return AppNotification(
    id: '1',
    title: 't',
    message: 'm',
    actionUrl: actionUrl,
    entityType: entityType,
    entityId: entityId,
    type: type,
    recipientRole: 'super_admin',
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('A2 activation rules', () {
    test('can approve KYC and subscription when pending', () {
      final kyc = SuperAdminKycActivationItem.fromJson(_kycPending());
      final sub = SuperAdminActivationItem.fromJson(_subscriptionPending());
      expect(canApproveKycActivation(kyc), isTrue);
      expect(canApproveActivation(sub), isTrue);
      expect(isMobileCompanyActivateDisabled(), isFalse);
      expect(validateKycRejectionReason(''), superAdminActivationRejectReasonRequiredAr);
      expect(validateActivationOverrideReason(''), superAdminActivationOverrideRequiredAr);
    });

    test('actionable count combines KYC and paid subscriptions', () {
      final snapshot = SuperAdminActivationQueueSnapshot(
        kycItems: [SuperAdminKycActivationItem.fromJson(_kycPending())],
        subscriptionItems: [SuperAdminActivationItem.fromJson(_subscriptionPending())],
      );
      expect(activationActionableCount(snapshot), 2);
    });

    test('actionable count excludes free-plan subscription rows', () {
      final snapshot = SuperAdminActivationQueueSnapshot(
        kycItems: const [],
        subscriptionItems: [
          SuperAdminActivationItem.fromJson(_subscriptionPending()),
          SuperAdminActivationItem.fromJson({
            ..._subscriptionPending(),
            'plan': {'id': '1', 'name': 'orderzhouse_free', 'title': 'مجاني', 'priceJod': 0},
          }),
        ],
      );
      expect(subscriptionActionableCount(snapshot.subscriptionItems), 1);
      expect(classifySubscriptionActivationItems(snapshot.subscriptionItems).legacyFree.length, 1);
    });
  });

  group('A2 action center', () {
    testWidgets('activation tile is in-app actionable section', (tester) async {
      tester.view.physicalSize = const Size(400, 1400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SuperAdminActionCenterView(
              greetingName: 'مشرف',
              initials: 'م',
              unread: 0,
              snapshot: const SuperAdminActionCenterSnapshot(
                identityRequests: SuperAdminCountCard(available: true, count: 2),
                subscriptionActivations: SuperAdminCountCard(available: true, count: 2),
                claims: SuperAdminCountCard(available: true, count: 0),
                unread: SuperAdminCountCard(available: true, count: 0),
                pantry: SuperAdminCountCard(available: true, count: 0),
                articles: SuperAdminCountCard(available: true, count: 0),
                internalOrders: SuperAdminCountCard(available: true, count: 2),
              ),
              onRetry: () {},
              onRefresh: () async {},
              onAvatarTap: () {},
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.byKey(const Key('sa-identity-requests-tile')), findsOneWidget);
      expect(find.byKey(const Key('sa-subscription-activation-tile')), findsOneWidget);
      expect(find.text(superAdminInAppActionsSectionAr), findsOneWidget);
      expect(find.text(superAdminActivationListHintAr), findsNWidgets(2));
      expect(find.byKey(const Key('sa-activation-open-web')), findsNothing);
      expect(find.textContaining('مرحلة A3'), findsOneWidget);
    });
  });

  group('A2 activation queue', () {
    testWidgets('shows KYC and subscription cards without web-only banner', (tester) async {
      tester.view.physicalSize = const Size(400, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final api = A2FakeSuperAdminApi()
        ..kycItems = [_kycPending()]
        ..activationItems = [_subscriptionPending()];

      await tester.pumpWidget(
        ProviderScope(
          overrides: [superAdminApiProvider.overrideWithValue(api)],
          child: const MaterialApp(home: SuperAdminActivationQueueScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text(superAdminActivationQueueTitleAr), findsOneWidget);
      expect(find.byKey(const Key('sa-kyc-queue-7')), findsOneWidget);
      expect(find.byKey(const Key('sa-subscription-queue-10')), findsOneWidget);
      expect(find.textContaining(superAdminActivationDocumentsAvailableAr), findsOneWidget);
      expect(find.textContaining('لوحة الويب'), findsNothing);
    });
  });

  group('A2 KYC detail', () {
    testWidgets('shows user info and secure image without public URLs', (tester) async {
      tester.view.physicalSize = const Size(400, 1200);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final api = A2FakeSuperAdminApi()..kycItems = [_kycPending()];

      await tester.pumpWidget(
        ProviderScope(
          overrides: [superAdminApiProvider.overrideWithValue(api)],
          child: const MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: SuperAdminActivationKycDetailScreen(requestId: '7'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('sa-detail-المستقل')), findsOneWidget);
      expect(find.textContaining('سارة'), findsOneWidget);
      expect(find.byKey(const Key('sa-kyc-image-front-7')), findsOneWidget);
      expect(find.byKey(const Key('sa-approve-kyc-7')), findsOneWidget);
      expect(find.byKey(const Key('sa-reject-kyc-7')), findsOneWidget);
    });

    testWidgets('approve confirmation and reject reason validation', (tester) async {
      tester.view.physicalSize = const Size(400, 1200);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final api = A2FakeSuperAdminApi()..kycItems = [_kycPending()];

      await tester.pumpWidget(
        ProviderScope(
          overrides: [superAdminApiProvider.overrideWithValue(api)],
          child: const MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: SuperAdminActivationKycDetailScreen(requestId: '7'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('sa-approve-kyc-7')));
      await tester.pumpAndSettle();
      expect(find.text(superAdminActivationConfirmApproveBodyAr), findsOneWidget);
      await tester.tap(find.byKey(superAdminConfirmKycActivationButtonKey));
      await tester.pumpAndSettle();
      expect(api.kycApproveCalls, 1);
      expect(find.text(superAdminActivationApproveSuccessAr), findsOneWidget);
    });

    testWidgets('reject requires reason then succeeds', (tester) async {
      tester.view.physicalSize = const Size(400, 1200);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final api = A2FakeSuperAdminApi()..kycItems = [_kycPending()];

      await tester.pumpWidget(
        ProviderScope(
          overrides: [superAdminApiProvider.overrideWithValue(api)],
          child: const MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: SuperAdminActivationKycDetailScreen(requestId: '7'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('sa-reject-kyc-7')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(superAdminKycRejectSubmitButtonKey));
      await tester.pump();
      expect(find.text(superAdminActivationRejectReasonRequiredAr), findsOneWidget);
      await tester.enterText(find.byKey(superAdminKycRejectReasonFieldKey), 'وثائق غير واضحة');
      await tester.pump();
      await tester.tap(find.byKey(superAdminKycRejectSubmitButtonKey));
      await tester.pumpAndSettle();
      expect(api.kycRejectCalls, 1);
      expect(find.text(superAdminActivationRejectSuccessAr), findsOneWidget);
    });

    test('activation screens do not expose public document URLs', () {
      final src = File('lib/features/super_admin/presentation/super_admin_activation_screens.dart')
          .readAsStringSync();
      expect(src, contains('fetchKycActivationFileBytes'));
      expect(src, contains('Image.memory'));
      expect(src, isNot(contains('http://')));
      expect(src, isNot(contains('https://')));
    });
  });

  group('A2 routing / security', () {
    test('notification routes to KYC detail or activation queue', () {
      expect(
        resolveNotificationAction(
          _n(actionUrl: '/dashboard/super-admin/freelancer-activation-requests/7'),
          currentUserRole: 'super_admin',
        )?.route,
        AppRoutes.superAdminActivationKycPath('7'),
      );
      expect(
        resolveNotificationAction(
          _n(actionUrl: '/dashboard/super-admin/freelancer-activation-requests'),
          currentUserRole: 'super_admin',
        )?.route,
        AppRoutes.superAdminActivation,
      );
      expect(
        resolveNotificationAction(
          _n(entityType: 'freelancer_activation_request', entityId: '7'),
          currentUserRole: 'super_admin',
        )?.route,
        AppRoutes.superAdminActivationKycPath('7'),
      );
      expect(
        resolveNotificationAction(
          _n(entityType: 'subscription', entityId: '10', type: 'subscription_activation'),
          currentUserRole: 'super_admin',
        )?.route,
        AppRoutes.superAdminActivationSubscriptionPath('10'),
      );
    });

    test('freelancer/client cannot access activation routes', () {
      for (final role in ['client', 'freelancer']) {
        expect(
          superAdminRoleRedirect(location: AppRoutes.superAdminActivation, effectiveRole: role),
          AppRoutes.home,
        );
        expect(
          superAdminRoleRedirect(
            location: AppRoutes.superAdminActivationKycPath('1'),
            effectiveRole: role,
          ),
          AppRoutes.home,
        );
      }
    });

    test('401/403 map to Arabic access denied', () {
      final err = DioException(
        requestOptions: RequestOptions(path: '/x'),
        response: Response(requestOptions: RequestOptions(path: '/x'), statusCode: 403),
      );
      expect(superAdminActionErrorMessage(err), superAdminAccessDeniedAr);
    });
  });
}
