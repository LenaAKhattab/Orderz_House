import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orderzhouse_app/core/constants/web_constants.dart';
import 'package:orderzhouse_app/features/freelancer/mini_articles/data/bildazo_errors.dart';
import 'package:orderzhouse_app/features/freelancer/mini_articles/data/mini_articles_copy.dart';
import 'package:orderzhouse_app/features/freelancer/mini_articles/data/mini_articles_side_models.dart';
import 'package:orderzhouse_app/features/freelancer/mini_articles/presentation/mini_articles_widgets.dart';
import 'package:orderzhouse_app/features/freelancer/my_articles/data/my_articles_copy.dart';
import 'package:orderzhouse_app/features/freelancer/my_articles/data/my_articles_models.dart';
import 'package:orderzhouse_app/features/freelancer/my_articles/presentation/my_articles_screen.dart';

void main() {
  group('Bildazo unified copy (M7)', () {
    test('required / CTA / linked / published strings match web', () {
      expect(
        bildazoRequiredAr,
        'لتتمكن من تنفيذ المقالات ونشر أعمالك باسمك، فعّل ملف الكاتب الخاص بك على Bildazo.',
      );
      expect(bildazoActivateCtaAr, 'تفعيل حساب الكاتب على Bildazo');
      expect(bildazoLinkedStatusAr, 'حساب Bildazo: مفعّل ✓');
      expect(bildazoPublishSuccessAr, 'تم نشر مقالك بنجاح على Bildazo.');
      expect(bildazoViewArticleAr, 'مشاهدة المقال');
      expect(bildazoViewWriterProfileAr, 'مشاهدة ملفي ككاتب');
      expect(myArticlesPublishSuccessAr, bildazoPublishSuccessAr);
      expect(myArticlesViewArticleAr, bildazoViewArticleAr);
      expect(myArticlesViewProfileAr, bildazoViewWriterProfileAr);
    });

    test('handoff constant points at freelancer articles hub', () {
      expect(
        WebConstants.freelancerBildazoWriterActivateUrl,
        WebConstants.freelancerArticlesUrl,
      );
      expect(WebConstants.freelancerArticlesPath, '/dashboard/freelancer/articles');
    });
  });

  group('BildazoAuthorLinkStatus parsing (M7)', () {
    test('camelCase profile + linked flags', () {
      final s = BildazoAuthorLinkStatus.fromResponse({
        'data': {
          'status': 'linked',
          'gateEnabled': true,
          'displayName': 'كاتب',
          'writerProfileUrl': 'https://bildazo.example/w/1',
          'bildazoLinked': true,
        },
      });
      expect(s.isLinked, isTrue);
      expect(s.resolvedProfileUrl, 'https://bildazo.example/w/1');
      expect(s.shouldBlockApply, isFalse);
    });

    test('snake_case aliases and missing optionals', () {
      final s = BildazoAuthorLinkStatus.fromResponse({
        'data': {
          'status': 'pending',
          'gate_enabled': true,
          'bildazo_profile_url': 'https://bildazo.example/p',
          'has_bildazo_author': false,
        },
      });
      expect(s.isLinked, isFalse);
      expect(s.gateEnabled, isTrue);
      expect(s.shouldBlockApply, isTrue);
      expect(s.resolvedProfileUrl, 'https://bildazo.example/p');
      expect(BildazoAuthorLinkStatus.fromResponse(null).isLinked, isFalse);
      expect(BildazoAuthorLinkStatus.fromResponse({}).status, isNull);
    });
  });

  group('Earned balance Bildazo URL aliases (M7)', () {
    test('parses bildazo_article_url snake_case', () {
      final e = EarnedBalanceEntry.fromJson({
        'application_id': '1',
        'amount_jod': '0.5',
        'bildazo_article_url': 'https://bildazo.example/a/9',
      });
      expect(e.bildazoUrl, 'https://bildazo.example/a/9');
    });
  });

  group('BildazoLinkPanel UI (M7)', () {
    testWidgets('not-linked gate shows required copy and activate CTA', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: BildazoLinkPanel(
              status: BildazoAuthorLinkStatus(status: 'pending', gateEnabled: true),
            ),
          ),
        ),
      );
      expect(find.text(bildazoRequiredAr), findsOneWidget);
      expect(find.text(bildazoActivateCtaAr), findsOneWidget);
      expect(find.textContaining('يجب ربط'), findsNothing);
      expect(find.textContaining('فتح ربط'), findsNothing);
    });

    testWidgets('linked state shows مفعّل and profile only when URL exists', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: BildazoLinkPanel(
              status: BildazoAuthorLinkStatus(
                status: 'linked',
                profileUrl: 'https://bildazo.example/me',
              ),
            ),
          ),
        ),
      );
      expect(find.textContaining(bildazoLinkedStatusAr), findsOneWidget);
      expect(find.text(bildazoViewWriterProfileAr), findsOneWidget);
      expect(find.text(bildazoActivateCtaAr), findsNothing);

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: BildazoLinkPanel(
              status: BildazoAuthorLinkStatus(status: 'linked'),
            ),
          ),
        ),
      );
      expect(find.text(bildazoLinkedStatusAr), findsOneWidget);
      expect(find.text(bildazoViewWriterProfileAr), findsNothing);
    });
  });

  group('My Articles published Bildazo actions (M7)', () {
    testWidgets('published card shows success and article button when URL exists', (tester) async {
      final item = MyArticleItem.fromJson({
        'applicationId': 'p1',
        'articleTitle': 'منشور',
        'portfolioStatus': 'published_on_bildazo',
        'bildazoPublish': {
          'status': 'published',
          'articleUrl': 'https://bildazo.example/a/1',
        },
        'writerProfileUrl': 'https://bildazo.example/w',
      });

      await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: MyArticleCard(item: item, onOpenUrl: (_) async => true))),
      );

      expect(find.text(bildazoPublishSuccessAr), findsOneWidget);
      expect(find.text(bildazoViewArticleAr), findsOneWidget);
      expect(find.text(bildazoViewWriterProfileAr), findsOneWidget);
    });

    testWidgets('missing URLs hide buttons without crash', (tester) async {
      final item = MyArticleItem.fromJson({
        'applicationId': 'p2',
        'articleTitle': 'بدون روابط',
        'portfolioStatus': 'published_on_bildazo',
        'bildazoPublish': {'status': 'already_imported'},
      });

      await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: MyArticleCard(item: item))),
      );

      expect(find.text(bildazoPublishSuccessAr), findsOneWidget);
      expect(find.text(bildazoViewArticleAr), findsNothing);
      expect(find.text(bildazoViewWriterProfileAr), findsNothing);
      expect(find.text('null'), findsNothing);
    });
  });

  group('Bildazo error mapping (M7)', () {
    DioException dio(String code, {int status = 409}) => DioException(
          requestOptions: RequestOptions(path: '/x'),
          response: Response(
            requestOptions: RequestOptions(path: '/x'),
            statusCode: status,
            data: {'publicCode': code, 'message': code},
          ),
          type: DioExceptionType.badResponse,
        );

    test('maps common codes to Arabic without raw enums', () {
      expect(mapBildazoActionErrorMessage(dio('BILDAZO_AUTHOR_LINK_REQUIRED')), bildazoNotLinkedErrorAr);
      expect(mapBildazoActionErrorMessage(dio('BILDAZO_PROFILE_INCOMPLETE')), bildazoIncompleteProfileErrorAr);
      expect(
        mapMiniArticleApplyErrorMessage(dio('BILDAZO_AUTHOR_LINK_REQUIRED')),
        bildazoNotLinkedErrorAr,
      );
      expect(mapBildazoActionErrorMessage(dio('X', status: 403)), bildazoPermissionErrorAr);
      expect(
        mapBildazoActionErrorMessage(Exception('boom')),
        bildazoActionFallbackErrorAr,
      );
      expect(mapMiniArticleApplyErrorMessage(dio('BILDAZO_AUTHOR_LINK_REQUIRED')), isNot(contains('_')));
    });
  });
}
