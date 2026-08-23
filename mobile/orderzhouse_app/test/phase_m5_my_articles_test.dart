import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orderzhouse_app/core/router/routes.dart';
import 'package:orderzhouse_app/features/auth/domain/auth_user.dart';
import 'package:orderzhouse_app/features/freelancer/my_articles/data/manuscript_copy.dart';
import 'package:orderzhouse_app/features/freelancer/my_articles/data/my_articles_copy.dart';
import 'package:orderzhouse_app/features/freelancer/my_articles/data/my_articles_errors.dart';
import 'package:orderzhouse_app/features/freelancer/my_articles/data/my_articles_models.dart';
import 'package:orderzhouse_app/features/freelancer/my_articles/presentation/my_articles_screen.dart';
import 'package:orderzhouse_app/features/notifications/data/notification_models.dart';
import 'package:orderzhouse_app/features/notifications/navigation/notification_action_resolver.dart';
import 'package:orderzhouse_app/features/profile/domain/profile_actions.dart';

void main() {
  group('MyArticlesSnapshot / MyArticleItem parsing (M5)', () {
    test('parses camelCase portfolio payload', () {
      final snap = MyArticlesSnapshot.fromResponse({
        'data': {
          'total': 1,
          'writerProfileUrl': 'https://bildazo.example/writer/me',
          'portfolioStatuses': ['awaiting_selection', 'published_on_bildazo'],
          'items': [
            {
              'applicationId': 'app-1',
              'articleId': 'art-9',
              'articleTitle': 'مقال تجريبي',
              'applicationStatus': 'approved',
              'portfolioStatus': 'published_on_bildazo',
              'portfolioStatusLabelAr': 'منشورة على Bildazo',
              'assignedAt': '2026-01-10T10:00:00.000Z',
              'submissionDate': '2026-01-12T10:00:00.000Z',
              'articleGrossValueJod': '10.000',
              'freelancerNetEarningJod': '7.000',
              'reviewStatus': 'approved',
              'bildazoPublish': {
                'status': 'published',
                'articleUrl': 'https://bildazo.example/a/1',
              },
              'writerProfileUrl': 'https://bildazo.example/writer/me',
              'actions': [
                {'key': 'view_bildazo_article', 'labelAr': 'مشاهدة المقال'},
              ],
            },
          ],
        },
      });

      expect(snap.total, 1);
      expect(snap.writerProfileUrl, contains('bildazo'));
      expect(snap.items, hasLength(1));
      final item = snap.items.first;
      expect(item.applicationId, 'app-1');
      expect(item.title, 'مقال تجريبي');
      expect(item.portfolioStatus, 'published_on_bildazo');
      expect(item.statusLabelAr, myArticlesStatusPublishedAr);
      expect(item.grossAmountJod, '10.000');
      expect(item.freelancerNetJod, '7.000');
      expect(item.resolvedArticleUrl, 'https://bildazo.example/a/1');
      expect(item.isPublishedOnBildazo, isTrue);
    });

    test('parses snake_case aliases and missing optionals', () {
      final snap = MyArticlesSnapshot.fromResponse({
        'data': {
          'items': [
            {
              'application_id': 'app-2',
              'article_id': 'art-2',
              'title': 'عنوان',
              'application_status': 'pending',
              'gross_amount_jod': '3.000',
              'writer_net_jod': '2.100',
            },
          ],
        },
      });
      final item = snap.items.single;
      expect(item.applicationId, 'app-2');
      expect(item.title, 'عنوان');
      expect(item.portfolioStatus, 'awaiting_selection');
      expect(item.statusLabelAr, myArticlesStatusAwaitingSelectionAr);
      expect(item.grossAmountJod, '3.000');
      expect(item.freelancerNetJod, '2.100');
      expect(item.resolvedArticleUrl, isNull);
      expect(item.revisionNote, isNull);
      expect(item.bildazoPublish, isNull);
    });

    test('parses backend applications array', () {
      final snap = MyArticlesSnapshot.fromResponse({
        'data': {
          'applications': [
            {
              'applicationId': 'app-backend',
              'articleTitle': 'من الخادم',
              'portfolioStatus': 'under_review',
            },
          ],
        },
      });
      expect(snap.items, hasLength(1));
      expect(snap.items.single.applicationId, 'app-backend');
      expect(snap.items.single.title, 'من الخادم');
    });

    test('empty list is safe', () {
      final snap = MyArticlesSnapshot.fromResponse({'data': {'items': [], 'total': 0}});
      expect(snap.items, isEmpty);
      expect(snap.total, 0);
    });

    test('malformed body does not crash', () {
      expect(MyArticlesSnapshot.fromResponse(null).items, isEmpty);
      expect(MyArticlesSnapshot.fromResponse('x').items, isEmpty);
      expect(MyArticlesSnapshot.fromResponse({}).items, isEmpty);
    });
  });

  group('status mapping (M5)', () {
    test('maps raw statuses to Arabic like web', () {
      expect(myArticlesPortfolioStatusLabelAr('pending'), myArticlesStatusAwaitingSelectionAr);
      expect(myArticlesPortfolioStatusLabelAr('awaiting_selection'), myArticlesStatusAwaitingSelectionAr);
      expect(myArticlesPortfolioStatusLabelAr('selected'), myArticlesStatusAwaitingExecutionAr);
      expect(myArticlesPortfolioStatusLabelAr('assigned'), myArticlesStatusAwaitingExecutionAr);
      expect(myArticlesPortfolioStatusLabelAr('writing'), myArticlesStatusAwaitingExecutionAr);
      expect(myArticlesPortfolioStatusLabelAr('submitted'), myArticlesStatusUnderReviewAr);
      expect(myArticlesPortfolioStatusLabelAr('under_review'), myArticlesStatusUnderReviewAr);
      expect(myArticlesPortfolioStatusLabelAr('revision_requested'), myArticlesStatusRevisionRequestedAr);
      expect(myArticlesPortfolioStatusLabelAr('approved'), myArticlesStatusAcceptedAr);
      expect(myArticlesPortfolioStatusLabelAr('published'), myArticlesStatusPublishedAr);
      expect(myArticlesPortfolioStatusLabelAr('already_imported'), myArticlesStatusPublishedAr);
      expect(myArticlesPortfolioStatusLabelAr('rejected'), myArticlesStatusRejectedAr);
      expect(myArticlesPortfolioStatusLabelAr('cancelled'), myArticlesStatusRejectedAr);
      expect(myArticlesPortfolioStatusLabelAr('withdrawn'), myArticlesStatusRejectedAr);
    });

    test('unknown status uses safe Arabic fallback', () {
      expect(myArticlesPortfolioStatusLabelAr('weird_enum_xyz'), myArticlesUnknownStatusAr);
      expect(myArticlesPortfolioStatusLabelAr(null), myArticlesUnknownStatusAr);
      expect(myArticlesPortfolioStatusLabelAr(''), myArticlesUnknownStatusAr);
    });

    test('prefers API Arabic label when present', () {
      expect(
        myArticlesPortfolioStatusLabelAr('pending', apiLabel: 'تسمية من الخادم'),
        'تسمية من الخادم',
      );
    });
  });

  group('MyArticleCard UI (M5)', () {
    test('empty-state copy matches web', () {
      expect(myArticlesEmptyTitleAr, 'لم تبدأ بعد في تنفيذ أي مقالات.');
    });

    testWidgets('published card shows success copy and مشاهدة المقال when URL exists', (tester) async {
      final item = MyArticleItem.fromJson({
        'applicationId': 'p1',
        'articleTitle': 'مقال منشور',
        'portfolioStatus': 'published_on_bildazo',
        'portfolioStatusLabelAr': myArticlesStatusPublishedAr,
        'bildazoPublish': {
          'status': 'published',
          'articleUrl': 'https://bildazo.example/pub/1',
        },
        'writerProfileUrl': 'https://bildazo.example/writer/x',
        'freelancerNetEarningJod': '1.200',
      });

      String? opened;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: MyArticleCard(
              item: item,
              onOpenUrl: (url) async {
                opened = url;
                return true;
              },
            ),
          ),
        ),
      );

      expect(find.text(myArticlesPublishSuccessAr), findsOneWidget);
      expect(find.text(myArticlesViewArticleAr), findsOneWidget);
      expect(find.text(myArticlesViewProfileAr), findsOneWidget);

      await tester.tap(find.text(myArticlesViewArticleAr));
      await tester.pump();
      expect(opened, 'https://bildazo.example/pub/1');
    });

    testWidgets('hides مشاهدة المقال when article URL missing', (tester) async {
      final item = MyArticleItem.fromJson({
        'applicationId': 'p2',
        'articleTitle': 'بدون رابط',
        'portfolioStatus': 'published_on_bildazo',
        'bildazoPublish': {'status': 'published'},
      });

      await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: MyArticleCard(item: item))),
      );

      expect(find.text(myArticlesPublishSuccessAr), findsOneWidget);
      expect(find.text(myArticlesViewArticleAr), findsNothing);
    });

    testWidgets('writer profile button only when URL exists', (tester) async {
      final withUrl = MyArticleItem.fromJson({
        'applicationId': 'w1',
        'articleTitle': 'مع ملف',
        'portfolioStatus': 'accepted',
        'writerProfileUrl': 'https://bildazo.example/w',
      });
      final withoutUrl = MyArticleItem.fromJson({
        'applicationId': 'w2',
        'articleTitle': 'بدون ملف',
        'portfolioStatus': 'accepted',
      });

      await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: MyArticleCard(item: withUrl))),
      );
      expect(find.text(myArticlesViewProfileAr), findsOneWidget);

      await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: MyArticleCard(item: withoutUrl))),
      );
      expect(find.text(myArticlesViewProfileAr), findsNothing);
    });

    testWidgets('gross labeled as article value not withdrawable', (tester) async {
      final item = MyArticleItem.fromJson({
        'applicationId': 'g1',
        'articleTitle': 'قيمة',
        'portfolioStatus': 'under_review',
        'articleGrossValueJod': '5.000',
        'freelancerNetEarningJod': '3.500',
      });

      await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: MyArticleCard(item: item))),
      );

      expect(find.textContaining(myArticlesGrossLabelAr), findsOneWidget);
      expect(find.textContaining('ليست للسحب'), findsOneWidget);
      expect(find.textContaining(myArticlesNetLabelAr), findsOneWidget);
      expect(find.textContaining('3.500'), findsOneWidget);
    });

    testWidgets('revision note shows for revision_requested', (tester) async {
      final item = MyArticleItem.fromJson({
        'applicationId': 'r1',
        'articleTitle': 'تعديل',
        'portfolioStatus': 'revision_requested',
        'revisionNote': 'يرجى توضيح المقدمة',
      });

      await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: MyArticleCard(item: item))),
      );

      expect(find.text(myArticlesStatusRevisionRequestedAr), findsOneWidget);
      expect(find.text('يرجى توضيح المقدمة'), findsOneWidget);
      expect(find.text(manuscriptActionReviseAr), findsOneWidget);
      expect(find.text(manuscriptActionSubmitAr), findsNothing);
    });
  });

  group('errors / auth (M5)', () {
    DioException dioStatus(int status) => DioException(
          requestOptions: RequestOptions(path: '/freelancer/article-applications'),
          response: Response(
            requestOptions: RequestOptions(path: '/freelancer/article-applications'),
            statusCode: status,
          ),
          type: DioExceptionType.badResponse,
        );

    test('401 uses login-friendly Arabic', () {
      expect(myArticlesErrorMessage(dioStatus(401)), myArticlesUnauthorizedAr);
    });

    test('403 uses permission-friendly Arabic', () {
      expect(myArticlesErrorMessage(dioStatus(403)), myArticlesForbiddenAr);
    });
  });

  group('navigation (M5)', () {
    test('route constant exists', () {
      expect(AppRoutes.freelancerMyArticles, '/freelancer/my-articles');
    });

    test('profile quick action includes مقالاتي for freelancer', () {
      final actions = profileQuickActionsForUser(
        const AuthUser(
          id: '1',
          email: 'f@example.com',
          firstName: 'F',
          role: 'freelancer',
          primaryRole: 'freelancer',
          isActive: true,
        ),
      );
      expect(actions.any((a) => a.id == ProfileActionId.myArticles), isTrue);
      expect(
        actions.any((a) => a.route == AppRoutes.freelancerMyArticles),
        isTrue,
      );
      expect(actions.any((a) => a.label == myArticlesTitleAr), isTrue);
    });

    test('notification deep link resolves my-articles', () {
      final target = resolveNotificationAction(
        const AppNotification(
          id: 'n1',
          title: 't',
          message: 'b',
          actionUrl: '/dashboard/freelancer/my-articles',
        ),
        currentUserRole: 'freelancer',
      );
      expect(target?.route, AppRoutes.freelancerMyArticles);
    });
  });
}
