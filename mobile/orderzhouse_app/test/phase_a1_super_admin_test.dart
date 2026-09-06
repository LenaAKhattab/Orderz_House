import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:orderzhouse_app/core/constants/web_constants.dart';
import 'package:orderzhouse_app/core/router/routes.dart';
import 'package:orderzhouse_app/features/auth/domain/auth_user.dart';
import 'package:orderzhouse_app/features/auth/presentation/auth_controller.dart';
import 'package:orderzhouse_app/features/home/presentation/client_home_screen.dart';
import 'package:orderzhouse_app/features/notifications/presentation/unread_notifications_controller.dart';
import 'package:orderzhouse_app/features/profile/domain/profile_actions.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_actions.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_api.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_models.dart';
import 'package:orderzhouse_app/features/super_admin/presentation/super_admin_action_center_screen.dart';
import 'package:orderzhouse_app/features/super_admin/presentation/super_admin_queue_screens.dart';

void main() {
  group('A1 Super Admin UX / counts', () {
    test('WebConstants expose central activation and internal-orders handoff paths', () {
      expect(
        WebConstants.superAdminSubscriptionsActivationPath,
        '/dashboard/super-admin/subscriptions/activation',
      );
      expect(WebConstants.superAdminInternalOrdersPath, '/dashboard/super-admin/orders');
      expect(
        WebConstants.superAdminSubscriptionsActivationUrl,
        endsWith('/dashboard/super-admin/subscriptions/activation'),
      );
      expect(WebConstants.superAdminInternalOrdersUrl, endsWith('/dashboard/super-admin/orders'));
    });

    test('regular admin is not Super Admin and has no SA experience flag', () {
      const admin = AuthUser(
        id: '1',
        email: 'a@x.com',
        primaryRole: 'admin',
      );
      const sa = AuthUser(
        id: '2',
        email: 's@x.com',
        primaryRole: 'super_admin',
      );
      expect(admin.usesSuperAdminExperience, isFalse);
      expect(admin.isRegularAdminWithoutMobileExperience, isTrue);
      expect(sa.usesSuperAdminExperience, isTrue);
      expect(sa.isRegularAdminWithoutMobileExperience, isFalse);
      expect(isMobileCompanyActivateDisabled(), isFalse);
    });

    testWidgets('activation tile is in-app actionable without web CTA', (tester) async {
      tester.view.physicalSize = const Size(400, 2000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      var avatarTapped = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Directionality(
              textDirection: TextDirection.rtl,
              child: SuperAdminActionCenterView(
                greetingName: 'مشرف',
                initials: 'م',
                unread: 2,
                snapshot: const SuperAdminActionCenterSnapshot(
                  identityRequests: SuperAdminCountCard(available: true, count: 5),
                  subscriptionActivations: SuperAdminCountCard(available: true, count: 0),
                  claims: SuperAdminCountCard(available: true, count: 0),
                  unread: SuperAdminCountCard(available: true, count: 99),
                  pantry: SuperAdminCountCard(available: true, count: 0),
                  articles: SuperAdminCountCard(available: true, count: 0),
                  internalOrders: SuperAdminCountCard(available: true, count: 3),
                ),
                onRetry: () {},
                onRefresh: () async {},
                onAvatarTap: () => avatarTapped = true,
              ),
            ),
          ),
        ),
      );

      expect(find.text(superAdminIdentityQueueTitleAr), findsOneWidget);
      expect(find.text(superAdminInAppActionsSectionAr), findsOneWidget);
      expect(find.byKey(const Key('sa-identity-requests-tile')), findsOneWidget);
      expect(find.byKey(const Key('sa-subscription-activation-tile')), findsOneWidget);
      expect(find.byKey(const Key('sa-activation-open-web')), findsNothing);
      expect(find.text(superAdminOpenWebPanelAr), findsOneWidget);
      expect(find.byKey(const Key('sa-internal-orders-open-web')), findsOneWidget);
      expect(find.byKey(const Key('sa-internal-orders-web-tile')), findsOneWidget);
      expect(find.text(superAdminInternalOrdersHintAr), findsOneWidget);
      expect(find.text('2'), findsWidgets);
      expect(find.text('99'), findsNothing);

      await tester.tap(find.text('م'));
      await tester.pump();
      expect(avatarTapped, isTrue);
    });

    testWidgets('avatar routes to account settings', (tester) async {
      await tester.pumpWidget(
        MaterialApp.router(
          routerConfig: GoRouter(
            initialLocation: '/sa-home',
            routes: [
              GoRoute(
                path: '/sa-home',
                builder: (context, _) => Scaffold(
                  body: SuperAdminActionCenterView(
                    greetingName: 'مشرف',
                    initials: 'م',
                    unread: 0,
                    snapshot: const SuperAdminActionCenterSnapshot(
                      identityRequests: SuperAdminCountCard(available: true, count: 0),
                      subscriptionActivations: SuperAdminCountCard(available: true, count: 0),
                      claims: SuperAdminCountCard(available: true, count: 0),
                      unread: SuperAdminCountCard(available: true, count: 0),
                      pantry: SuperAdminCountCard(available: true, count: 0),
                      articles: SuperAdminCountCard(available: true, count: 0),
                      internalOrders: SuperAdminCountCard(available: false),
                    ),
                    onRetry: () {},
                    onRefresh: () async {},
                    onAvatarTap: () => context.push(AppRoutes.accountSettings),
                  ),
                ),
              ),
              GoRoute(
                path: AppRoutes.accountSettings,
                builder: (_, _) => const Scaffold(body: Text('settings-ok')),
              ),
            ],
          ),
        ),
      );

      await tester.tap(find.text('م'));
      await tester.pumpAndSettle();
      expect(find.text('settings-ok'), findsOneWidget);
    });

    testWidgets('activation queue lists actionable requests in-app', (tester) async {
      tester.view.physicalSize = const Size(400, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final api = _FakeActivationApi();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [superAdminApiProvider.overrideWithValue(api)],
          child: const MaterialApp(home: SuperAdminActivationQueueScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text(superAdminActivationQueueTitleAr), findsOneWidget);
      expect(find.byKey(const Key('sa-kyc-queue-7')), findsNothing);
      expect(find.byKey(const Key('sa-subscription-queue-9')), findsOneWidget);
      expect(find.textContaining('لوحة الويب'), findsNothing);
    });

    testWidgets('regular admin sees mobile-disabled banner and not SA tiles', (tester) async {
      tester.view.physicalSize = const Size(400, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authControllerProvider.overrideWith(_AdminAuth.new),
            unreadNotificationsControllerProvider.overrideWith((ref) async => 0),
          ],
          child: const MaterialApp(home: ClientHomeScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('regular-admin-mobile-disabled-banner')), findsOneWidget);
      expect(find.text(regularAdminMobileDisabledMessageAr), findsOneWidget);
      expect(find.text(superAdminActivationTileTitleAr), findsNothing);
      expect(find.text(superAdminInAppActionsSectionAr), findsNothing);
      expect(find.text('مركز المهام'), findsNothing);
    });

    testWidgets('internal orders tile hidden when unavailable', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SuperAdminActionCenterView(
              greetingName: 'مشرف',
              initials: 'م',
              unread: 0,
              snapshot: const SuperAdminActionCenterSnapshot(
                identityRequests: SuperAdminCountCard(available: true, count: 0),
                subscriptionActivations: SuperAdminCountCard(available: true, count: 0),
                claims: SuperAdminCountCard(available: true, count: 0),
                unread: SuperAdminCountCard(available: true, count: 0),
                pantry: SuperAdminCountCard(available: true, count: 0),
                articles: SuperAdminCountCard(available: true, count: 0),
                internalOrders: SuperAdminCountCard(available: false),
              ),
              onRetry: () {},
              onRefresh: () async {},
              onAvatarTap: () {},
            ),
          ),
        ),
      );
      expect(find.byKey(const Key('sa-internal-orders-web-tile')), findsNothing);
    });
  });
}

class _FakeActivationApi extends SuperAdminApi {
  _FakeActivationApi() : super(Dio());

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
  Future<dynamic> fetchActivationQueue({int page = 1, int limit = 20}) async => {
        'data': {
          'subscriptions': [
            {
              'id': '9',
              'freelancerName': 'خالد',
              'freelancerEmail': 'k@x.com',
              'planTitle': 'فضي',
              'priceJod': 10,
              'activationStatus': 'company_pending',
              'paymentStatus': 'paid',
              'needsCompanyActivation': true,
            },
          ],
        },
      };
}

class _AdminAuth extends AuthController {
  @override
  AuthState build() => const AuthState(
        status: AuthStatus.authenticated,
        user: AuthUser(id: 'a1', email: 'admin@x.com', primaryRole: 'admin'),
      );
}
