import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orderzhouse_app/features/freelancer/data/plan_upgrade_cta.dart';
import 'package:orderzhouse_app/features/freelancer/mini_articles/data/mini_articles_api.dart';
import 'package:orderzhouse_app/features/freelancer/mini_articles/data/mini_articles_copy.dart';
import 'package:orderzhouse_app/features/freelancer/mini_articles/data/mini_articles_models.dart';
import 'package:orderzhouse_app/features/freelancer/mini_articles/data/mini_articles_side_models.dart';
import 'package:orderzhouse_app/features/freelancer/mini_articles/presentation/mini_articles_widgets.dart';
import 'package:orderzhouse_app/features/freelancer/presentation/plan_upgrade_required_cta.dart';

void main() {
  group('MiniArticle models', () {
    test('formats full article value label', () {
      expect(formatArticleValueJodLabel(1), 'قيمة المقال: 1.000 JOD');
      expect(formatArticleValueJodLabel(1.5), 'قيمة المقال: 1.500 JOD');
    });

    test('parses list and prefers totalArticleValueJod', () {
      final articles = MiniArticle.parseListResponse({
        'data': {
          'articles': [
            {
              'id': 'a1',
              'title': 'مقال تجريبي',
              'status': 'released',
              'articleValueJod': 0.5,
              'totalArticleValueJod': 1.0,
              'freelancerShareJod': 0.7,
              'reviewerShareJod': 0.2,
              'companyShareJod': 0.1,
              'bidCollection': {
                'requiredBidCount': 5,
                'currentBidCount': 2,
                'status': 'collecting',
              },
            },
          ],
        },
      });
      expect(articles, hasLength(1));
      expect(articles.first.displayValueJod, 1.0);
      expect(formatArticleValueJodLabel(articles.first.displayValueJod), 'قيمة المقال: 1.000 JOD');
      expect(articles.first.bidCollection?.progressLabel, '2 / 5 متقدم');
      expect(articles.first.toString(), isNot(contains('fairness')));
      expect(articles.first.toString(), isNot(contains('campaignBudget')));
    });

    test('selected/lost application labels without weights', () {
      final selected = ArticleApplication.fromJson({'id': '1', 'status': 'selected'});
      final lost = ArticleApplication.fromJson({'id': '2', 'status': 'lost'});
      expect(selected.statusLabelAr, 'تم اختيارك');
      expect(lost.statusLabelAr, 'لم يتم اختيارك');
      expect(selected.statusLabelAr, isNot(contains('weight')));
      expect(lost.statusLabelAr, isNot(contains('fairness')));
    });
  });

  group('Apply / Bid error mapping', () {
    DioException dioErr(String code) => DioException(
          requestOptions: RequestOptions(path: '/x'),
          response: Response(
            requestOptions: RequestOptions(path: '/x'),
            statusCode: 400,
            data: {'code': code, 'message': 'raw'},
          ),
        );

    test('insufficient Bids message', () {
      expect(
        mapMiniArticleApplyErrorMessage(dioErr('INSUFFICIENT_BID_CREDITS')),
        applyInsufficientBidsAr,
      );
    });

    test('Bildazo required API error uses short Arabic', () {
      expect(
        mapMiniArticleApplyErrorMessage(dioErr('BILDAZO_AUTHOR_LINK_REQUIRED')),
        bildazoNotLinkedErrorAr,
      );
    });

    test('Bildazo gate eligibility uses full required copy', () {
      expect(
        eligibilityMessageAr(
          const ArticleApplicationEligibility(
            eligible: false,
            reason: 'BILDAZO_AUTHOR_LINK_REQUIRED',
          ),
        ),
        bildazoRequiredAr,
      );
    });

    test('plan lock shows upgrade CTA helper; Bids/Bildazo do not', () {
      expect(
        shouldShowArticlePlanUpgradeCta(
          const ArticleApplicationEligibility(
            eligible: false,
            reason: 'ARTICLE_ACCESS_LEVEL_INSUFFICIENT',
          ),
        ),
        isTrue,
      );
      expect(isPlanUpgradeReason('ARTICLE_ACCESS_LEVEL_INSUFFICIENT'), isTrue);
      expect(
        shouldShowArticlePlanUpgradeCta(
          const ArticleApplicationEligibility(
            eligible: false,
            reason: 'INSUFFICIENT_BID_CREDITS',
          ),
        ),
        isFalse,
      );
      expect(
        shouldShowArticlePlanUpgradeCta(
          const ArticleApplicationEligibility(
            eligible: false,
            reason: 'BILDAZO_AUTHOR_LINK_REQUIRED',
          ),
        ),
        isFalse,
      );
      expect(
        shouldShowArticlePlanUpgradeCta(
          const ArticleApplicationEligibility(
            eligible: false,
            reason: 'ACTIVATION_CAMPAIGN_PAUSED',
          ),
        ),
        isFalse,
      );
    });
  });

  group('Earned Balance', () {
    test('uses net writer amount only — not gross article value', () {
      final snap = EarnedBalanceSnapshot.fromResponse({
        'data': {
          'totalPendingJod': '0.700',
          'totalAcceptedArticles': 1,
          'totalPublishedArticles': 0,
          'entries': [
            {
              'applicationId': 'app1',
              'articleTitle': 'مقال أ',
              'amountJod': '0.700',
              'status': 'pending',
            },
          ],
        },
      });
      expect(snap.totalPendingJod, '0.700');
      expect(snap.entries.first.amountJod, '0.700');
      expect(snap.entries.first.statusLabelAr, earnedBalancePendingAr);
      // Gross field must not appear on earned balance model.
      expect(snap.toString(), isNot(contains('totalArticleValue')));
      expect(snap.toString(), isNot(contains('companyShare')));
    });
  });

  group('MiniArticlesApi apply', () {
    test('POST applications then refreshes detail context', () async {
      final paths = <String>[];
      final dio = Dio(BaseOptions(baseUrl: 'http://test'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            paths.add('${options.method} ${options.path}');
            if (options.method == 'POST') {
              handler.resolve(
                Response(
                  requestOptions: options,
                  statusCode: 200,
                  data: {
                    'data': {
                      'application': {'id': 'app1', 'status': 'pending'},
                    },
                  },
                ),
              );
              return;
            }
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {
                  'data': {
                    'article': {
                      'id': 'art1',
                      'title': 'مقال',
                      'totalArticleValueJod': 1.0,
                      'freelancerShareJod': 0.7,
                    },
                    'application': {'id': 'app1', 'status': 'pending'},
                    'eligibility': {'eligible': false, 'reason': 'ALREADY_APPLIED'},
                  },
                },
              ),
            );
          },
        ),
      );

      final api = MiniArticlesApi(dio);
      final ctx = await api.apply(articleId: 'art1', proposalMessage: 'مرحبا');
      expect(paths, contains('POST /freelancer/marketplace-articles/art1/applications'));
      expect(paths.any((p) => p.startsWith('GET /freelancer/marketplace-articles/art1/application')), isTrue);
      expect(ctx.application?.id, 'app1');
      expect(ctx.article.displayValueJod, 1.0);
    });
  });

  group('UI widgets', () {
    testWidgets('list card renders full article value', (tester) async {
      final article = MiniArticle.fromJson({
        'id': 'a1',
        'title': 'عنوان المقال',
        'status': 'released',
        'totalArticleValueJod': 1.0,
        'bidCollection': {'currentBidCount': 1, 'requiredBidCount': 3},
      });
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: MiniArticleListCard(article: article, onTap: () {}),
          ),
        ),
      );
      expect(find.text('عنوان المقال'), findsOneWidget);
      expect(find.text('قيمة المقال: 1.000 JOD'), findsOneWidget);
      expect(find.textContaining('ميزانية'), findsNothing);
      expect(find.textContaining('fund'), findsNothing);
      expect(find.textContaining('fairness'), findsNothing);
    });

    testWidgets('detail financial breakdown shows shares; gross not as earned', (tester) async {
      final article = MiniArticle.fromJson({
        'id': 'a1',
        'title': 'تفاصيل',
        'totalArticleValueJod': 1.0,
        'freelancerShareJod': 0.7,
        'reviewerShareJod': 0.2,
        'companyShareJod': 0.1,
      });
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ListView(
              children: [
                Text(formatArticleValueJodLabel(article.displayValueJod)),
                MiniArticleFinancialBreakdown(article: article),
                const Text(earnedBalanceTitleAr),
                Text('صافي المستقل: 0.700 JOD'),
              ],
            ),
          ),
        ),
      );
      expect(find.text('قيمة المقال: 1.000 JOD'), findsOneWidget);
      expect(find.text('إجمالي قيمة المقال'), findsOneWidget);
      expect(find.text('صافي مستحقاتك بعد التوزيع'), findsOneWidget);
      expect(find.text('حصة التدقيق'), findsOneWidget);
      expect(find.text('حصة المنصة'), findsOneWidget);
      expect(find.text('0.700 JOD'), findsOneWidget);
      // Earned section uses net, not labeling gross as earned balance.
      expect(find.text(earnedBalanceTitleAr), findsOneWidget);
      expect(find.text('صافي المستقل: 0.700 JOD'), findsOneWidget);
      expect(find.textContaining('قيمة المقال: 1.000 JOD · رصيد مكتسب'), findsNothing);
    });

    testWidgets('Bildazo required message renders', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Text(bildazoRequiredAr),
          ),
        ),
      );
      expect(find.text(bildazoRequiredAr), findsOneWidget);
    });

    testWidgets('Earned Balance panel renders net amount', (tester) async {
      final snap = EarnedBalanceSnapshot.fromResponse({
        'data': {
          'totalPendingJod': '0.700',
          'totalAvailableJod': '0.700',
          'withdrawalPolicy': {'allowed': true},
          'entries': [
            {
              'applicationId': 'x',
              'articleTitle': 'مقال منشور',
              'amountJod': '0.700',
              'status': 'settled_externally',
              'withdrawable': true,
            },
          ],
        },
      });
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: EarnedBalancePanel(snapshot: snap)),
        ),
      );
      expect(find.text(earnedBalanceTitleAr), findsOneWidget);
      expect(find.text(earnedBalanceNotWithdrawableAr), findsOneWidget);
      expect(find.textContaining('صافي المستقل: 0.700 JOD'), findsOneWidget);
      expect(find.textContaining(earnedBalanceRecordedAr), findsWidgets);
      expect(find.textContaining('1.000'), findsNothing);
    });

    testWidgets('plan lock CTA shows only for plan reason', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                if (shouldShowArticlePlanUpgradeCta(
                  const ArticleApplicationEligibility(
                    eligible: false,
                    reason: 'ARTICLE_ACCESS_LEVEL_INSUFFICIENT',
                  ),
                ))
                  const PlanUpgradeRequiredCta(requiredTierCode: 'silver'),
                if (shouldShowArticlePlanUpgradeCta(
                  const ArticleApplicationEligibility(
                    eligible: false,
                    reason: 'INSUFFICIENT_BID_CREDITS',
                  ),
                ))
                  const PlanUpgradeRequiredCta(),
              ],
            ),
          ),
        ),
      );
      expect(find.text(planUpgradeButtonLabelAr), findsOneWidget);
      expect(find.textContaining('Silver'), findsWidgets);
    });

    testWidgets('selected/lost states render without weights', (tester) async {
      final selected = ArticleApplication.fromJson({'id': '1', 'status': 'selected'});
      final lost = ArticleApplication.fromJson({'id': '2', 'status': 'lost'});
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                Text(selected.statusLabelAr),
                Text(lost.statusLabelAr),
              ],
            ),
          ),
        ),
      );
      expect(find.text('تم اختيارك'), findsOneWidget);
      expect(find.text('لم يتم اختيارك'), findsOneWidget);
      expect(find.textContaining('weight'), findsNothing);
      expect(find.textContaining('fairness'), findsNothing);
      expect(find.textContaining('budget'), findsNothing);
    });
  });
}
