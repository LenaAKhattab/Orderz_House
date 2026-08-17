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
import 'package:orderzhouse_app/features/super_admin/data/super_admin_article_actions.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_article_models.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_controllers.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_models.dart';
import 'package:orderzhouse_app/features/super_admin/presentation/super_admin_article_screens.dart';
import 'package:orderzhouse_app/features/super_admin/presentation/super_admin_queue_screens.dart';

class FakeSuperAdminApi extends SuperAdminApi {
  FakeSuperAdminApi() : super(Dio());

  List<Map<String, dynamic>> articles = [];
  Map<String, dynamic>? articleDetail;
  Map<String, dynamic>? applicationsBody;
  Object? articlesError;
  Completer<void>? articlesGate;
  Completer<void>? selectGate;
  Completer<void>? relistGate;
  int selectCalls = 0;
  int relistCalls = 0;
  int articleDetailCalls = 0;
  int applicationsCalls = 0;
  final List<Map<String, dynamic>> selectPayloads = [];

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
        'data': {
          'subscriptions': [],
          'pagination': {'total': 0},
        },
      };

  @override
  Future<dynamic> fetchPendingClaims() async => {
        'data': {'claims': []},
      };

  @override
  Future<dynamic> fetchPantryRequests() async => {
        'data': {'requests': []},
      };

  @override
  Future<dynamic> fetchPantryDeliveries({String? status = 'submitted'}) async => {
        'data': {'deliveries': []},
      };

  @override
  Future<dynamic> fetchMarketplaceArticles({int limit = 50, int offset = 0}) async {
    if (articlesGate != null) await articlesGate!.future;
    if (articlesError != null) throw articlesError!;
    return {
      'data': {'articles': articles},
    };
  }

  @override
  Future<dynamic> fetchMarketplaceArticle(String articleId) async {
    articleDetailCalls++;
    return articleDetail ??
        {
          'data': {
            'article': articles.firstWhere(
              (e) => '${e['id']}' == articleId,
              orElse: () => {'id': articleId, 'title': 'مقال', 'status': 'published'},
            ),
          },
        };
  }

  @override
  Future<dynamic> fetchArticleApplications(String articleId) async {
    applicationsCalls++;
    return applicationsBody ??
        {
          'data': {
            'applications': <Map<String, dynamic>>[],
            'bidCollection': const {'status': 'collecting'},
            'fairRanking': const {'eligibleForAssignment': false},
          },
        };
  }

  @override
  Future<void> selectArticleApplication({
    required String applicationId,
    String? overrideReason,
  }) async {
    selectCalls++;
    selectPayloads.add({
      'applicationId': applicationId,
      'overrideReason': ?overrideReason,
    });
    if (selectGate != null) await selectGate!.future;
  }

  @override
  Future<void> relistArticleBidCollection(String articleId) async {
    relistCalls++;
    if (relistGate != null) await relistGate!.future;
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

Map<String, dynamic> _article({
  String id = '5',
  String title = 'مقال عاجل',
  String collection = 'eligible_for_assignment',
  int current = 10,
  int required = 10,
  int relist = 0,
  bool? canRelist,
  String status = 'published',
  double value = 3,
}) {
  return {
    'id': id,
    'title': title,
    'status': status,
    'articleValueJod': value,
    'relistCount': relist,
    'createdAt': '2026-08-01T10:00:00Z',
    'bidCollection': {
      'status': collection,
      'current': current,
      'required': required,
      'canRelistBidCollection': ?canRelist,
      'relistCount': relist,
    },
  };
}

Map<String, dynamic> _applicationsBody({
  required String collection,
  bool canRelist = false,
  bool eligible = true,
  String? recommendedId = '10',
  List<Map<String, dynamic>>? applications,
}) {
  return {
    'data': {
      'applications': applications ??
          [
            {
              'id': '10',
              'freelancerFirstName': 'موصى',
              'freelancerFamilyName': 'الأول',
              'status': 'pending',
              'submittedAt': '2026-08-02T10:00:00Z',
            },
            {
              'id': '11',
              'freelancerFirstName': 'آخر',
              'freelancerFamilyName': 'متقدم',
              'status': 'pending',
            },
          ],
      'bidCollection': {
        'bidCollectionStatus': collection,
        'currentBidCount': 10,
        'requiredBidCount': 10,
        'thresholdReached': collection != 'minimum_not_met' && collection != 'collecting',
        'canRelistBidCollection': canRelist,
      },
      'fairRanking': {
        'eligibleForAssignment': eligible,
        'recommendedApplicationId': recommendedId,
        'candidates': [
          {'applicationId': '10', 'rank': 1},
          {'applicationId': '11', 'rank': 2},
        ],
      },
    },
  };
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('routing / security', () {
    test('Super Admin can open article queue and detail', () {
      expect(
        superAdminRoleRedirect(location: AppRoutes.superAdminArticles, effectiveRole: 'super_admin'),
        isNull,
      );
      expect(
        superAdminRoleRedirect(
          location: AppRoutes.superAdminArticlePath('5'),
          effectiveRole: 'super_admin',
        ),
        isNull,
      );
    });

    test('client and freelancer cannot open article action routes', () {
      expect(
        superAdminRoleRedirect(location: AppRoutes.superAdminArticles, effectiveRole: 'client'),
        AppRoutes.home,
      );
      expect(
        superAdminRoleRedirect(
          location: AppRoutes.superAdminArticlePath('5'),
          effectiveRole: 'freelancer',
        ),
        AppRoutes.home,
      );
    });
  });

  group('article queue parser', () {
    test('shows progress, threshold, eligible, minimum_not_met, and relist count', () {
      final items = parseArticleAttention({
        'data': {
          'articles': [
            _article(collection: 'threshold_reached'),
            _article(id: '7', collection: 'eligible_for_assignment', current: 10, required: 10),
            _article(id: '8', collection: 'minimum_not_met', current: 3, required: 10, relist: 2),
            _article(id: '9', collection: 'collecting', current: 1, required: 10),
          ],
        },
      });
      expect(items.any((e) => e.id == '9'), isFalse);
      expect(items.firstWhere((e) => e.id == '5').progressLabel, '10 / 10');
      expect(items.firstWhere((e) => e.id == '5').statusLabel, 'اكتمل العدد المطلوب');
      expect(items.firstWhere((e) => e.id == '7').statusLabel, 'جاهز للإسناد');
      expect(items.firstWhere((e) => e.id == '8').statusLabel, 'لم يكتمل الحد الأدنى');
      expect(items.firstWhere((e) => e.id == '8').relistCount, 2);
      expect(items.firstWhere((e) => e.id == '8').progressLabel, '3 / 10');
    });
  });

  group('article queue widgets', () {
    Future<void> pumpQueue(WidgetTester tester, FakeSuperAdminApi api) async {
      tester.view.physicalSize = const Size(400, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        ProviderScope(
          key: UniqueKey(),
          overrides: [superAdminApiProvider.overrideWithValue(api)],
          child: const MaterialApp(home: SuperAdminArticlesQueueScreen()),
        ),
      );
    }

    testWidgets('loading / success / empty / error', (tester) async {
      final loadingApi = FakeSuperAdminApi()..articlesGate = Completer<void>();
      await pumpQueue(tester, loadingApi);
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsWidgets);
      loadingApi.articlesGate!.complete();
      await tester.pumpAndSettle();

      final emptyApi = FakeSuperAdminApi();
      await pumpQueue(tester, emptyApi);
      await tester.pumpAndSettle();
      expect(find.text('لا توجد مقالات تحتاج متابعة.'), findsOneWidget);

      final successApi = FakeSuperAdminApi()
        ..articles = [
          _article(),
          _article(id: '8', collection: 'minimum_not_met', current: 3, required: 10, relist: 2),
        ];
      await pumpQueue(tester, successApi);
      await tester.pumpAndSettle();
      expect(find.text('مقال عاجل'), findsWidgets);
      expect(find.textContaining('10 / 10'), findsOneWidget);
      expect(find.text('جاهز للإسناد'), findsOneWidget);
      expect(find.text('لم يكتمل الحد الأدنى'), findsOneWidget);
      expect(find.textContaining(superAdminPantryRelistLabelAr), findsOneWidget);

      final errorApi = FakeSuperAdminApi()
        ..articlesError = DioException(
          requestOptions: RequestOptions(path: '/super-admin/marketplace-articles'),
          response: Response(
            requestOptions: RequestOptions(path: '/super-admin/marketplace-articles'),
            statusCode: 403,
          ),
          type: DioExceptionType.badResponse,
        );
      await pumpQueue(tester, errorApi);
      await tester.pumpAndSettle();
      expect(find.text(superAdminAccessDeniedAr), findsOneWidget);
    });
  });

  group('selection rules', () {
    test('recommended select does not require override; non-recommended does', () {
      const ranking = SuperAdminArticleFairRanking(
        eligibleForAssignment: true,
        recommendedApplicationId: '10',
      );
      expect(isRecommendedArticleApplicant('10', ranking), isTrue);
      expect(selectRequiresOverride(applicationId: '10', ranking: ranking), isFalse);
      expect(selectRequiresOverride(applicationId: '11', ranking: ranking), isTrue);
      expect(validateArticleOverrideReason('قصير'), isNotNull);
      expect(validateArticleOverrideReason('سبب كافٍ للتجاوز هنا'), isNull);
    });

    test('relist only when eligible and no selected applicant', () {
      final eligible = parseArticleDetail(
        articleId: '5',
        applicationsBody: _applicationsBody(collection: 'minimum_not_met', canRelist: true),
      );
      expect(canRelistArticleBidCollection(eligible), isTrue);

      final notEligible = parseArticleDetail(
        articleId: '5',
        applicationsBody: _applicationsBody(collection: 'eligible_for_assignment'),
      );
      expect(canRelistArticleBidCollection(notEligible), isFalse);

      final selected = parseArticleDetail(
        articleId: '5',
        applicationsBody: _applicationsBody(
          collection: 'minimum_not_met',
          canRelist: true,
          applications: [
            {
              'id': '10',
              'status': 'selected',
              'freelancerFirstName': 'موصى',
            },
          ],
        ),
      );
      expect(canRelistArticleBidCollection(selected), isFalse);
    });
  });

  group('application review widgets', () {
    testWidgets('selecting recommended requires confirmation only', (tester) async {
      tester.view.physicalSize = const Size(400, 1100);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final api = FakeSuperAdminApi()
        ..articleDetail = {
          'data': {'article': _article()},
        }
        ..applicationsBody = _applicationsBody(collection: 'eligible_for_assignment');

      await tester.pumpWidget(
        ProviderScope(
          overrides: [superAdminApiProvider.overrideWithValue(api)],
          child: const MaterialApp(home: SuperAdminArticleDetailScreen(articleId: '5')),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text(superAdminRecommendedBidLabelAr), findsOneWidget);
      expect(find.textContaining('10 / 10'), findsOneWidget);

      await tester.tap(find.text(superAdminSelectApplicantLabelAr).first);
      await tester.pumpAndSettle();
      expect(find.text(superAdminConfirmSelectBodyAr), findsOneWidget);
      expect(find.text(superAdminOverrideReasonLabelAr), findsNothing);
      expect(api.selectCalls, 0);
      await tester.tap(find.text(superAdminCancelActionLabelAr));
      await tester.pumpAndSettle();
      expect(api.selectCalls, 0);
    });

    testWidgets('non-recommended select requires override; short reason is blocked', (tester) async {
      tester.view.physicalSize = const Size(400, 1100);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final api = FakeSuperAdminApi()
        ..articleDetail = {
          'data': {'article': _article()},
        }
        ..applicationsBody = _applicationsBody(collection: 'eligible_for_assignment');

      await tester.pumpWidget(
        ProviderScope(
          overrides: [superAdminApiProvider.overrideWithValue(api)],
          child: const MaterialApp(home: SuperAdminArticleDetailScreen(articleId: '5')),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text(superAdminSelectApplicantLabelAr).at(1));
      await tester.pumpAndSettle();
      expect(find.text(superAdminOverrideReasonLabelAr), findsOneWidget);
      expect(find.text(superAdminArticleOverrideHelperAr), findsOneWidget);
      await tester.enterText(find.byKey(const Key(superAdminArticleOverrideFieldKey)), 'قصير');
      await tester.pump();
      final confirm = tester.widget<FilledButton>(
        find.byKey(const Key(superAdminSelectApplicantConfirmKey)),
      );
      expect(confirm.onPressed, isNull);
      expect(api.selectCalls, 0);
    });

    testWidgets('double tap does not send duplicate select; success refreshes', (tester) async {
      tester.view.physicalSize = const Size(400, 1100);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final api = FakeSuperAdminApi()
        ..articleDetail = {
          'data': {'article': _article()},
        }
        ..applicationsBody = _applicationsBody(collection: 'eligible_for_assignment');
      final gate = Completer<void>();
      api.selectGate = gate;

      await tester.pumpWidget(
        ProviderScope(
          overrides: [superAdminApiProvider.overrideWithValue(api)],
          child: const MaterialApp(home: SuperAdminArticleDetailScreen(articleId: '5')),
        ),
      );
      await tester.pumpAndSettle();
      final applicationsBefore = api.applicationsCalls;
      await tester.tap(find.text(superAdminSelectApplicantLabelAr).first);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key(superAdminSelectApplicantConfirmKey)));
      await tester.pump();
      expect(api.selectCalls, 1);

      final container = ProviderScope.containerOf(
        tester.element(find.byType(SuperAdminArticleDetailScreen)),
      );
      final second = container.read(superAdminArticleDetailProvider('5').notifier).selectApplicant(
            applicationId: '10',
          );
      expect(await second, isFalse);
      expect(api.selectCalls, 1);
      gate.complete();
      await tester.pump();
      await tester.pump();
      expect(find.text(superAdminActionSuccessAr), findsOneWidget);
      expect(api.applicationsCalls, greaterThan(applicationsBefore));
    });
  });

  group('relist widgets', () {
    testWidgets('relist appears only when canRelistBidCollection is true and requires confirmation', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(400, 1100);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final hiddenApi = FakeSuperAdminApi()
        ..articleDetail = {
          'data': {'article': _article()},
        }
        ..applicationsBody = _applicationsBody(collection: 'eligible_for_assignment');
      await tester.pumpWidget(
        ProviderScope(
          key: UniqueKey(),
          overrides: [superAdminApiProvider.overrideWithValue(hiddenApi)],
          child: const MaterialApp(home: SuperAdminArticleDetailScreen(articleId: '5')),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text(superAdminRelistArticleLabelAr), findsNothing);

      final api = FakeSuperAdminApi()
        ..articleDetail = {
          'data': {'article': _article(collection: 'minimum_not_met', canRelist: true)},
        }
        ..applicationsBody = _applicationsBody(collection: 'minimum_not_met', canRelist: true);
      await tester.pumpWidget(
        ProviderScope(
          key: UniqueKey(),
          overrides: [superAdminApiProvider.overrideWithValue(api)],
          child: const MaterialApp(home: SuperAdminArticleDetailScreen(articleId: '5')),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text(superAdminRelistArticleLabelAr), findsOneWidget);
      await tester.tap(find.text(superAdminRelistArticleLabelAr));
      await tester.pumpAndSettle();
      expect(find.text(superAdminConfirmRelistBodyAr), findsOneWidget);
      expect(api.relistCalls, 0);
      await tester.tap(find.text(superAdminCancelActionLabelAr));
      await tester.pumpAndSettle();
      expect(api.relistCalls, 0);
    });

    testWidgets('relist double tap is guarded', (tester) async {
      tester.view.physicalSize = const Size(400, 1100);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final api = FakeSuperAdminApi()
        ..articleDetail = {
          'data': {'article': _article(collection: 'minimum_not_met', canRelist: true)},
        }
        ..applicationsBody = _applicationsBody(collection: 'minimum_not_met', canRelist: true);
      final gate = Completer<void>();
      api.relistGate = gate;

      await tester.pumpWidget(
        ProviderScope(
          overrides: [superAdminApiProvider.overrideWithValue(api)],
          child: const MaterialApp(home: SuperAdminArticleDetailScreen(articleId: '5')),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text(superAdminRelistArticleLabelAr));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key(superAdminRelistArticleConfirmKey)));
      await tester.pump();
      expect(api.relistCalls, 1);

      final container = ProviderScope.containerOf(
        tester.element(find.byType(SuperAdminArticleDetailScreen)),
      );
      final second = container.read(superAdminArticleDetailProvider('5').notifier).relistBidCollection();
      expect(await second, isFalse);
      expect(api.relistCalls, 1);
      gate.complete();
      await tester.pump();
      await tester.pump();
      expect(find.text(superAdminActionSuccessAr), findsOneWidget);
    });
  });

  group('notification resolver', () {
    test('article admin URL maps to queue, detail, or safe fallback', () {
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
      final unknown = resolveNotificationAction(
        _n(
          actionUrl: '/dashboard/super-admin/marketplace-articles/new',
          recipientRole: 'super_admin',
        ),
        currentUserRole: 'super_admin',
      );
      expect(unknown?.route, AppRoutes.home);
      expect(unknown?.showComingSoonMessage, isTrue);
      expect(
        resolveNotificationAction(
          _n(
            recipientRole: 'super_admin',
            entityType: 'marketplace_article',
            entityId: '9',
          ),
          currentUserRole: 'super_admin',
        )?.route,
        AppRoutes.superAdminArticlePath('9'),
      );
    });

    test('client and freelancer cannot follow Super Admin article destinations', () {
      expect(
        resolveNotificationAction(
          _n(actionUrl: '/dashboard/super-admin/marketplace-articles/5', recipientRole: 'super_admin'),
          currentUserRole: 'client',
        ),
        isNull,
      );
      expect(
        resolveNotificationAction(
          _n(actionUrl: '/dashboard/super-admin/marketplace-articles', recipientRole: 'admin'),
          currentUserRole: 'freelancer',
        ),
        isNull,
      );
    });
  });

  group('source guards', () {
    test('no auto-assign, payout, ledger, pricing, Work Token, or Article Token UI', () {
      final screens =
          File('lib/features/super_admin/presentation/super_admin_article_screens.dart').readAsStringSync();
      expect(screens, contains('superAdminSelectApplicantLabelAr'));
      expect(screens, contains('superAdminRelistArticleLabelAr'));
      expect(screens, isNot(contains('تسعير')));
      expect(screens, isNot(contains('صرف')));
      expect(screens, isNot(contains('auto-assign')));
      expect(screens, isNot(contains('Work Token')));
      expect(screens, isNot(contains('Article Token')));
      expect(screens, isNot(contains('رفض المتقدم')));
      expect(screens, isNot(contains('/reject')));

      final api = File('lib/features/super_admin/data/super_admin_api.dart').readAsStringSync();
      expect(api, contains('/article-applications/'));
      expect(api, contains('/select'));
      expect(api, contains('relist-bid-collection'));
      expect(api, isNot(contains('article-applications/\$applicationId/reject')));
      expect(api, isNot(contains('/pricing')));
      expect(api, isNot(contains('freelancer-payments')));
      expect(api, isNot(contains('debugPrint')));
    });
  });
}
