import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/core/router/routes.dart';
import 'package:orderzhouse_app/core/router/super_admin_access.dart';
import 'package:orderzhouse_app/features/auth/domain/register_payload.dart';
import 'package:orderzhouse_app/features/notifications/data/notification_models.dart';
import 'package:orderzhouse_app/features/notifications/navigation/notification_action_resolver.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_actions.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_article_actions.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_article_models.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_models.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_pantry_actions.dart';

AppNotification _n({
  String? actionUrl,
  String? recipientRole,
  String? entityType,
  String? entityId,
}) {
  return AppNotification(
    id: '1',
    title: 'عنوان',
    message: 'رسالة',
    actionUrl: actionUrl,
    recipientRole: recipientRole,
    entityType: entityType,
    entityId: entityId,
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Super Admin routes and aliases', () {
    const saRoutes = [
      '/super-admin',
      '/super-admin/notifications',
      '/super-admin/account',
      '/super-admin/activation',
      '/super-admin/financial-claims',
      '/super-admin/claims',
      '/super-admin/pantry',
      '/super-admin/pantry/requests/8',
      '/super-admin/pantry/deliveries/3',
      '/super-admin/articles',
      '/super-admin/articles/5',
    ];

    test('Super Admin is allowed on all Super Admin locations', () {
      for (final location in saRoutes) {
        expect(
          superAdminRoleRedirect(location: location, effectiveRole: 'super_admin'),
          isNull,
          reason: location,
        );
      }
    });

    test('aliases map shell/QA paths to primary Flutter routes', () {
      expect(superAdminPathAlias('/super-admin'), AppRoutes.home);
      expect(superAdminPathAlias('/super-admin/notifications'), AppRoutes.notifications);
      expect(superAdminPathAlias('/super-admin/account'), AppRoutes.accountSettings);
      expect(superAdminPathAlias('/super-admin/financial-claims'), AppRoutes.superAdminClaims);
      expect(superAdminPathAlias(AppRoutes.superAdminActivation), isNull);
      expect(superAdminPathAlias(AppRoutes.superAdminPantryRequestPath('8')), isNull);
      expect(superAdminPathAlias(AppRoutes.superAdminArticlePath('5')), isNull);
    });

    test('client and freelancer cannot access any /super-admin/* route', () {
      for (final location in saRoutes) {
        expect(
          superAdminRoleRedirect(location: location, effectiveRole: 'client'),
          AppRoutes.home,
          reason: 'client $location',
        );
        expect(
          superAdminRoleRedirect(location: location, effectiveRole: 'freelancer'),
          AppRoutes.home,
          reason: 'freelancer $location',
        );
      }
    });

    test('Super Admin is redirected away from client/freelancer surfaces', () {
      const blocked = [
        '/marketplace',
        '/my-orders',
        '/courses',
        '/courses/1',
        '/client/orders/create',
        '/client/orders/9',
        '/freelancer/pantry/1',
        '/freelancer/my-orders/2',
        '/orders/pool/3',
      ];
      for (final location in blocked) {
        expect(
          superAdminRoleRedirect(location: location, effectiveRole: 'super_admin'),
          AppRoutes.home,
          reason: location,
        );
      }
    });

    test('popup ads remain hidden for Super Admin', () {
      expect(shouldShowPopupAdsForRole('super_admin'), isFalse);
      expect(shouldShowPopupAdsForRole('client'), isTrue);
      expect(shouldShowPopupAdsForRole('freelancer'), isTrue);
    });
  });

  group('public signup', () {
    test('only client/freelancer; program_admin and merchant blocked', () {
      expect(PublicSignupAccountType.allowed, equals({'client', 'freelancer'}));
      expect(PublicSignupAccountType.blocked, contains('program_admin'));
      expect(PublicSignupAccountType.blocked, contains('merchant'));
      expect(PublicSignupAccountType.blocked, contains('super_admin'));
    });
  });

  group('notification resolver final mappings', () {
    test('activation / claims / pantry / articles map to Flutter screens', () {
      expect(
        resolveNotificationAction(
          _n(actionUrl: '/dashboard/super-admin/subscriptions/activation', recipientRole: 'super_admin'),
          currentUserRole: 'super_admin',
        )?.route,
        AppRoutes.superAdminActivation,
      );
      expect(
        resolveNotificationAction(
          _n(actionUrl: '/dashboard/super-admin/financial-claims', recipientRole: 'super_admin'),
          currentUserRole: 'super_admin',
        )?.route,
        AppRoutes.superAdminClaims,
      );
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
      expect(
        resolveNotificationAction(
          _n(actionUrl: '/dashboard/super-admin/pantry/requests/44', recipientRole: 'super_admin'),
          currentUserRole: 'super_admin',
        )?.route,
        AppRoutes.superAdminPantryRequestPath('44'),
      );
      expect(
        resolveNotificationAction(
          _n(actionUrl: '/dashboard/super-admin/pantry/deliveries/3', recipientRole: 'super_admin'),
          currentUserRole: 'super_admin',
        )?.route,
        AppRoutes.superAdminPantryDeliveryPath('3'),
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
          _n(actionUrl: '/dashboard/super-admin/marketplace-articles/5', recipientRole: 'super_admin'),
          currentUserRole: 'super_admin',
        )?.route,
        AppRoutes.superAdminArticlePath('5'),
      );
    });

    test('unsafe links blocked; unknown Super Admin path falls back with coming-soon', () {
      const blocked = [
        'https://evil.com',
        'http://evil.com',
        'javascript:alert(1)',
        '/dashboard/../../../etc',
        '/dashboard/admin/orders',
        '/dashboard/admin',
      ];
      for (final url in blocked) {
        expect(
          resolveNotificationAction(
            _n(actionUrl: url, recipientRole: 'super_admin'),
            currentUserRole: 'super_admin',
          ),
          isNull,
          reason: url,
        );
      }
      final unknown = resolveNotificationAction(
        _n(actionUrl: '/dashboard/super-admin/analysis', recipientRole: 'super_admin'),
        currentUserRole: 'super_admin',
      );
      expect(unknown?.route, AppRoutes.home);
      expect(unknown?.showComingSoonMessage, isTrue);
      expect(superAdminComingSoonMessageAr, 'هذه المهمة ستتوفر قريبًا على التطبيق.');
    });

    test('client and freelancer cannot follow Super Admin destinations', () {
      expect(
        resolveNotificationAction(
          _n(actionUrl: '/dashboard/super-admin/financial-claims', recipientRole: 'super_admin'),
          currentUserRole: 'client',
        ),
        isNull,
      );
      expect(
        resolveNotificationAction(
          _n(actionUrl: '/dashboard/super-admin/marketplace-articles/5', recipientRole: 'admin'),
          currentUserRole: 'freelancer',
        ),
        isNull,
      );
    });
  });

  group('activation / claims / pantry / article safety', () {
    test('activation approve is web-only; claims omit paid/pricing/payout', () {
      expect(superAdminActivationWebOnlyMessageAr, contains('لوحة الويب'));
      expect(isMobileCompanyActivateDisabled(), isTrue);
      expect(superAdminAllowedClaimStatusValues, ['accepted', 'rejected', 'frozen', 'requires_in_person_review']);
      expect(isAllowedClaimStatusAction('paid'), isFalse);
      expect(claimStatusRequiresNote('rejected'), isTrue);
      expect(validateClaimAdminNote(status: 'rejected', note: 'لا'), isNotNull);
      expect(validateClaimAdminNote(status: 'rejected', note: 'سبب كاف'), isNull);
    });

    test('parsers tolerate missing fields and keep JOD-only money', () {
      final claims = parseClaimsList({
        'data': {
          'claims': [
            {'id': '1'},
          ],
        },
      });
      expect(claims, hasLength(1));
      expect(formatSuperAdminJod(25), contains('د.أ'));
      expect(formatSuperAdminJod(25), isNot(contains('USD')));

      final articles = parseArticleAttention({
        'data': {
          'articles': [
            {'id': '5', 'bidCollection': {'status': 'minimum_not_met'}},
          ],
        },
      });
      expect(articles.first.id, '5');
      expect(articles.first.title, 'مقال');
    });

    test('pantry override and article relist/select rules remain conservative', () {
      expect(validatePantryOverrideReason('قصير'), isNotNull);
      expect(validateArticleOverrideReason('قصير'), isNotNull);
      final relist = parseArticleDetail(
        articleId: '5',
        applicationsBody: {
          'data': {
            'applications': [
              {'id': '10', 'status': 'pending'},
            ],
            'bidCollection': {
              'bidCollectionStatus': 'minimum_not_met',
              'canRelistBidCollection': true,
            },
          },
        },
      );
      expect(canRelistArticleBidCollection(relist), isTrue);
      expect(
        canSelectArticleApplication(detail: relist, application: relist.applications.first),
        isFalse,
      );
    });
  });

  group('source guards', () {
    test('no disk cache, auto-assign, tokens, pricing, payout, ledger, or article reject', () {
      final api = File('lib/features/super_admin/data/super_admin_api.dart').readAsStringSync();
      expect(api, isNot(contains('SharedPreferences')));
      expect(api, isNot(contains('debugPrint')));
      expect(api, isNot(contains('/pricing')));
      expect(api, isNot(contains('freelancer-payments')));
      expect(api, isNot(contains('financial-center')));
      expect(api, isNot(contains('article-applications/\$applicationId/reject')));

      final articleUi =
          File('lib/features/super_admin/presentation/super_admin_article_screens.dart').readAsStringSync();
      expect(articleUi, isNot(contains('auto-assign')));
      expect(articleUi, isNot(contains('Work Token')));
      expect(articleUi, isNot(contains('Article Token')));
      expect(articleUi, isNot(contains('/reject')));

      final pantryUi =
          File('lib/features/super_admin/presentation/super_admin_pantry_screens.dart').readAsStringSync();
      expect(pantryUi, isNot(contains('تسعير')));
      expect(pantryUi, isNot(contains('صرف')));
      expect(pantryUi, isNot(contains('archive')));

      final activation = File('lib/features/super_admin/presentation/super_admin_queue_screens.dart').readAsStringSync();
      expect(activation, contains('superAdminActivationWebOnlyMessageAr'));
      expect(activation, isNot(contains('sa-approve-activation-')));
      expect(activation, isNot(contains('رفض التفعيل')));

      final freelancerPantry = File('lib/features/pantry/presentation/pantry_hub_screen.dart').readAsStringSync();
      expect(freelancerPantry, isNot(contains('overrideReason')));
      expect(freelancerPantry, isNot(contains('اعتماد التسليم')));
    });
  });
}
