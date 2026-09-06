import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/core/router/routes.dart';
import 'package:orderzhouse_app/core/router/super_admin_access.dart';
import 'package:orderzhouse_app/features/auth/domain/auth_user.dart';
import 'package:orderzhouse_app/features/auth/domain/register_payload.dart';
import 'package:orderzhouse_app/features/notifications/data/notification_models.dart';
import 'package:orderzhouse_app/features/notifications/navigation/notification_action_resolver.dart';
import 'package:orderzhouse_app/features/profile/domain/profile_actions.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_models.dart';
import 'package:orderzhouse_app/features/super_admin/presentation/super_admin_action_center_screen.dart';
import 'package:orderzhouse_app/features/super_admin/presentation/super_admin_ui.dart';

AuthUser _user(String role) {
  return AuthUser(
    id: '1',
    email: '$role@test.com',
    firstName: 'Test',
    primaryRole: role,
    role: role,
    roles: [role],
  );
}

AppNotification _n({
  String? actionUrl,
  String? entityType,
  String? entityId,
  String? recipientRole,
  String? type,
}) {
  return AppNotification(
    id: '1',
    title: 'عنوان',
    message: 'رسالة',
    actionUrl: actionUrl,
    entityType: entityType,
    entityId: entityId,
    recipientRole: recipientRole,
    type: type,
  );
}

void main() {
  group('AuthUser Super Admin', () {
    test('recognizes super_admin and hyphenated super-admin', () {
      expect(_user('super_admin').usesSuperAdminExperience, isTrue);
      expect(_user('super_admin').usesClientExperience, isFalse);
      expect(_user('super_admin').usesFreelancerExperience, isFalse);
      expect(_user('client').usesSuperAdminExperience, isFalse);
      expect(_user('freelancer').usesSuperAdminExperience, isFalse);

      final hyphen = AuthUser.fromJson({
        'id': '9',
        'email': 'sa@test.com',
        'primaryRole': 'super-admin',
      });
      expect(hyphen.effectiveRole, 'super_admin');
      expect(hyphen.usesSuperAdminExperience, isTrue);
    });

    test('client and freelancer routing flags unchanged', () {
      expect(_user('client').usesClientExperience, isTrue);
      expect(_user('freelancer').usesFreelancerExperience, isTrue);
    });
  });

  group('superAdminRoleRedirect', () {
    test('Super Admin is sent home from client/freelancer surfaces', () {
      expect(
        superAdminRoleRedirect(location: AppRoutes.marketplace, effectiveRole: 'super_admin'),
        AppRoutes.home,
      );
      expect(
        superAdminRoleRedirect(location: AppRoutes.clientCreateOrder, effectiveRole: 'super_admin'),
        AppRoutes.home,
      );
      expect(
        superAdminRoleRedirect(location: '/freelancer/pantry/1', effectiveRole: 'super_admin'),
        AppRoutes.home,
      );
      expect(
        superAdminRoleRedirect(location: AppRoutes.home, effectiveRole: 'super_admin'),
        isNull,
      );
      expect(
        superAdminRoleRedirect(location: AppRoutes.superAdminClaims, effectiveRole: 'super_admin'),
        isNull,
      );
    });

    test('client and freelancer cannot open Super Admin routes', () {
      expect(
        superAdminRoleRedirect(location: AppRoutes.superAdminActivation, effectiveRole: 'client'),
        AppRoutes.home,
      );
      expect(
        superAdminRoleRedirect(location: AppRoutes.superAdminClaims, effectiveRole: 'freelancer'),
        AppRoutes.home,
      );
      expect(
        superAdminRoleRedirect(location: AppRoutes.home, effectiveRole: 'client'),
        isNull,
      );
      expect(
        superAdminRoleRedirect(location: AppRoutes.marketplace, effectiveRole: 'freelancer'),
        isNull,
      );
    });

    test('popup ads hidden for Super Admin only', () {
      expect(shouldShowPopupAdsForRole('super_admin'), isFalse);
      expect(shouldShowPopupAdsForRole('client'), isTrue);
      expect(shouldShowPopupAdsForRole('freelancer'), isTrue);
    });
  });

  group('register still blocks staff roles', () {
    test('program_admin is blocked from public signup', () {
      expect(PublicSignupAccountType.blocked, contains('program_admin'));
      expect(PublicSignupAccountType.allowed.contains('super_admin'), isFalse);
    });
  });

  group('profile actions — Super Admin', () {
    test('does not include client create-order or freelancer claims', () {
      final actions = profileQuickActionsForUser(_user('super_admin'));
      final ids = actions.map((a) => a.id).toSet();
      expect(ids, contains(ProfileActionId.superAdminHome));
      expect(ids, contains(ProfileActionId.notifications));
      expect(ids, isNot(contains(ProfileActionId.createOrder)));
      expect(ids, isNot(contains(ProfileActionId.financialClaims)));
      expect(ids, isNot(contains(ProfileActionId.marketplace)));
    });
  });

  group('notification resolver — Super Admin', () {
    test('maps known super-admin dashboard paths', () {
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
      expect(
        resolveNotificationAction(
          _n(actionUrl: '/dashboard/super-admin/pantry', recipientRole: 'admin'),
          currentUserRole: 'super_admin',
        )?.route,
        AppRoutes.superAdminPantry,
      );
      expect(
        resolveNotificationAction(
          _n(actionUrl: '/dashboard/super-admin/marketplace-articles', recipientRole: 'super_admin'),
          currentUserRole: 'super_admin',
        )?.route,
        AppRoutes.superAdminArticles,
      );
      expect(
        resolveNotificationAction(
          _n(actionUrl: '/dashboard/super-admin', recipientRole: 'super_admin'),
          currentUserRole: 'super_admin',
        )?.route,
        AppRoutes.home,
      );
    });

    test('unknown super-admin path falls back to Action Center with coming-soon flag', () {
      final target = resolveNotificationAction(
        _n(actionUrl: '/dashboard/super-admin/analysis', recipientRole: 'super_admin'),
        currentUserRole: 'super_admin',
      );
      expect(target?.route, AppRoutes.home);
      expect(target?.showComingSoonMessage, isTrue);
      expect(target?.route, isNot(contains('dashboard')));
    });

    test('client and freelancer still cannot follow Super Admin URLs', () {
      expect(
        resolveNotificationAction(
          _n(actionUrl: '/dashboard/super-admin/financial-claims', recipientRole: 'super_admin'),
          currentUserRole: 'client',
        ),
        isNull,
      );
      expect(
        resolveNotificationAction(
          _n(actionUrl: '/dashboard/super-admin/pantry', recipientRole: 'admin'),
          currentUserRole: 'freelancer',
        ),
        isNull,
      );
    });

    test('unsafe external and javascript URLs stay rejected for Super Admin', () {
      const bad = [
        'https://evil.com',
        'javascript:alert(1)',
        '//evil.com',
        '/dashboard/../../../etc',
      ];
      for (final url in bad) {
        expect(
          resolveNotificationAction(
            _n(actionUrl: url, recipientRole: 'super_admin'),
            currentUserRole: 'super_admin',
          ),
          isNull,
        );
        expect(isNotificationLinkUnsafe(url), isTrue);
      }
    });
  });

  group('Super Admin parsers', () {
    test('home-fast does not bind identity/subscription to subscriptionsAwaitingActivation', () {
      final snap = parseHomeFastSnapshot({
        'success': true,
        'data': {
          'summary': {
            'attention': {
              'subscriptionsAwaitingActivation': 4027,
              'financialClaimsPending': 0,
              'unreadNotifications': 0,
              'internalOrdersPendingClaims': 0,
            },
            'platformOrders': {
              'openProjects': 10,
              'inProgressProjects': 5,
              'completedProjects': 8,
            },
          },
        },
      });
      expect(snap.identityRequests.pending, isTrue);
      expect(snap.subscriptionActivations.pending, isTrue);
      expect(snap.identityRequests.count, isNull);
      expect(snap.subscriptionActivations.count, isNull);
      expect(snap.activations.pending, isTrue);
      expect(snap.claims.count, 0);
      expect(snap.unread.count, 0);
      expect(snap.platformOrdersAvailable, isTrue);
      expect(snap.hasUrgentWork, isFalse);
    });

    test('claims list uses JOD formatter', () {
      final items = parseClaimsList({
        'data': {
          'claims': [
            {
              'id': '11',
              'requestTitle': 'مشروع',
              'status': 'pending',
              'totalPriceSnapshot': 25.5,
              'freelancer': {'firstName': 'أ', 'familyName': 'ب'},
            },
          ],
        },
      });
      expect(items, hasLength(1));
      expect(formatSuperAdminJod(items.first.totalPriceJod), contains('د.أ'));
      expect(formatSuperAdminJod(items.first.totalPriceJod), isNot(contains('USD')));
    });

    test('pantry and article attention filters collection statuses', () {
      final pantry = parsePantryAttention(
        requestsBody: {
          'data': {
            'requests': [
              {
                'id': '1',
                'title': 'مونة',
                'status': 'open',
                'bidCollection': {
                  'status': 'eligible_for_assignment',
                  'current': 10,
                  'required': 10,
                },
              },
              {
                'id': '2',
                'title': 'عادي',
                'status': 'open',
                'bidCollection': {'status': 'collecting', 'current': 1, 'required': 10},
              },
            ],
          },
        },
        deliveriesBody: {
          'data': {
            'deliveries': [
              {'id': '9', 'status': 'submitted', 'requestTitle': 'تسليم'},
            ],
          },
        },
      );
      expect(pantry.map((e) => e.id), containsAll(['1', '9']));
      expect(pantry.any((e) => e.id == '2'), isFalse);

      final articles = parseArticleAttention({
        'data': {
          'articles': [
            {
              'id': '5',
              'title': 'مقال',
              'articleValueJod': 3,
              'bidCollection': {'status': 'minimum_not_met'},
            },
            {
              'id': '6',
              'title': 'تجاهل',
              'bidCollection': {'status': 'collecting'},
            },
          ],
        },
      });
      expect(articles, hasLength(1));
      expect(articles.first.id, '5');
    });
  });

  group('Action Center UI states', () {
    testWidgets('loading / error / empty / success', (tester) async {
      tester.view.physicalSize = const Size(400, 1600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      Future<void> pump(Widget child) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Directionality(textDirection: TextDirection.rtl, child: child),
            ),
          ),
        );
      }

      await pump(
        SuperAdminActionCenterView(
          greetingName: 'أحمد',
          initials: 'أ',
          unread: 0,
          isLoading: true,
          onRetry: () {},
          onRefresh: () async {},
          onAvatarTap: () {},
        ),
      );
      expect(find.textContaining('جاري تحميل'), findsOneWidget);

      await pump(
        SuperAdminActionCenterView(
          greetingName: 'أحمد',
          initials: 'أ',
          unread: 0,
          errorMessage: superAdminAccessDeniedAr,
          onRetry: () {},
          onRefresh: () async {},
          onAvatarTap: () {},
        ),
      );
      expect(find.text(superAdminAccessDeniedAr), findsOneWidget);

      const empty = SuperAdminActionCenterSnapshot(
        identityRequests: SuperAdminCountCard(available: true, count: 0),
        subscriptionActivations: SuperAdminCountCard(available: true, count: 0),
        claims: SuperAdminCountCard(available: true, count: 0),
        unread: SuperAdminCountCard(available: true, count: 0),
        pantry: SuperAdminCountCard(available: true, count: 0),
        articles: SuperAdminCountCard(available: true, count: 0),
        internalOrders: SuperAdminCountCard(available: true, count: 0),
      );
      await pump(
        SuperAdminActionCenterView(
          greetingName: 'أحمد',
          initials: 'أ',
          unread: 0,
          snapshot: empty,
          onRetry: () {},
          onRefresh: () async {},
          onAvatarTap: () {},
        ),
      );
      expect(find.text('لا توجد مهام عاجلة حالياً.'), findsOneWidget);

      const success = SuperAdminActionCenterSnapshot(
        identityRequests: SuperAdminCountCard(available: true, count: 1),
        subscriptionActivations: SuperAdminCountCard(available: true, count: 1),
        claims: SuperAdminCountCard(available: true, count: 1),
        unread: SuperAdminCountCard(available: true, count: 99),
        pantry: SuperAdminCountCard(available: false),
        articles: SuperAdminCountCard(available: true, count: 0),
        internalOrders: SuperAdminCountCard(available: true, count: 4),
      );
      await pump(
        SuperAdminActionCenterView(
          greetingName: 'أحمد',
          initials: 'أ',
          unread: 3,
          snapshot: success,
          onRetry: () {},
          onRefresh: () async {},
          onAvatarTap: () {},
        ),
      );
      expect(find.text(superAdminIdentityQueueTitleAr), findsOneWidget);
      expect(find.text(superAdminInAppActionsSectionAr), findsOneWidget);
      expect(find.text(superAdminWebFollowUpSectionAr), findsOneWidget);
      expect(find.text('غير متاح حاليًا'), findsOneWidget);
      expect(find.text('1'), findsNWidgets(3));
      // Unread tile uses header source (3), not stale home-fast (99).
      expect(find.text('3'), findsWidgets);
      expect(find.text('99'), findsNothing);
      expect(find.byKey(const Key('sa-identity-requests-tile')), findsOneWidget);
      expect(find.byKey(const Key('sa-subscription-activation-tile')), findsOneWidget);
      expect(find.byKey(const Key('sa-internal-orders-web-tile')), findsOneWidget);
      expect(find.textContaining('اعتماد التفعيل'), findsNothing);
    });

    testWidgets('Super Admin count tile has no payout/pricing actions', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SuperAdminCountTile(
              title: 'مطالبات مالية تحتاج إجراء',
              card: const SuperAdminCountCard(available: true, count: 1),
              icon: Icons.payments_outlined,
              onTap: () {},
            ),
          ),
        ),
      );
      expect(find.text('تسعير'), findsNothing);
      expect(find.text('صرف'), findsNothing);
      expect(find.textContaining('payout'), findsNothing);
    });
  });

  group('source guards', () {
    test('shell has three Super Admin tabs and MainShell hides ads', () {
      final shell = File('lib/features/super_admin/presentation/super_admin_shell.dart').readAsStringSync();
      expect(shell, contains('الرئيسية'));
      expect(shell, contains('الإشعارات'));
      expect(shell, contains('الحساب'));
      expect(shell, isNot(contains('الطلبات')));
      expect(shell, isNot(contains('PopupAdsHost')));

      final mainShell = File('lib/features/shell/main_shell.dart').readAsStringSync();
      expect(mainShell, contains('shouldShowPopupAdsForRole'));
      expect(mainShell, contains('usesSuperAdminExperience'));

      final home = File('lib/features/home/presentation/home_screen.dart').readAsStringSync();
      expect(home, contains('usesSuperAdminExperience'));
      expect(home, contains('SuperAdminShell'));

      final saShell = File('lib/features/super_admin/presentation/super_admin_shell.dart').readAsStringSync();
      expect(saShell, contains('_openedTabs'));
      expect(saShell, contains('NotificationsScreen'));

      final controllers =
          File('lib/features/super_admin/data/super_admin_controllers.dart').readAsStringSync();
      expect(controllers, contains('unawaited(_enrichPantryArticlesAndActivations'));
      expect(controllers, contains('_loadHomeSnapshot'));
      expect(controllers, contains('_fetchTimeout'));
    });

    test('queue screens have no payout/pricing or pantry mutations', () {
      final queues = File('lib/features/super_admin/presentation/super_admin_queue_screens.dart').readAsStringSync();
      expect(queues, contains('formatSuperAdminJod'));
      expect(queues, isNot(contains('freelancer-payments')));
      expect(queues, isNot(contains('/pricing')));
      expect(queues, isNot(contains('approveDelivery')));
      expect(queues, isNot(contains('overrideReason')));

      final models = File('lib/features/super_admin/data/super_admin_models.dart').readAsStringSync();
      expect(models, contains('د.أ'));

      final api = File('lib/features/super_admin/data/super_admin_api.dart').readAsStringSync();
      expect(api, isNot(contains('/pricing')));
      expect(api, isNot(contains('freelancer-payments')));
      expect(api, isNot(contains('financial-center')));
    });
  });
}
