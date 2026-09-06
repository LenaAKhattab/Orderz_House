import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orderzhouse_app/features/freelancer/my_articles/data/manuscript_copy.dart';
import 'package:orderzhouse_app/features/freelancer/my_articles/data/manuscript_errors.dart';
import 'package:orderzhouse_app/features/freelancer/my_articles/data/manuscript_models.dart';
import 'package:orderzhouse_app/features/freelancer/my_articles/data/my_articles_api.dart';
import 'package:orderzhouse_app/features/freelancer/my_articles/data/my_articles_models.dart';
import 'package:orderzhouse_app/features/freelancer/my_articles/presentation/manuscript_submit_args.dart';
import 'package:orderzhouse_app/features/freelancer/my_articles/presentation/manuscript_submit_screen.dart';
import 'package:orderzhouse_app/features/freelancer/my_articles/presentation/my_articles_screen.dart';

MyArticleItem _item(Map<String, dynamic> json) => MyArticleItem.fromJson(json);

void main() {
  group('My Articles manuscript CTAs (M6)', () {
    testWidgets('shows تسليم المقال for selected/assigned/writing when canSubmit', (tester) async {
      for (final status in ['selected', 'assigned', 'writing']) {
        final item = _item({
          'applicationId': 'a-$status',
          'articleTitle': 'مقال $status',
          'applicationStatus': status,
          'portfolioStatus': 'awaiting_execution',
          'canSubmit': true,
          'actions': [
            {'key': 'submit_manuscript'},
          ],
        });
        expect(item.showSubmitManuscriptAction, isTrue, reason: status);
        expect(item.showResubmitManuscriptAction, isFalse, reason: status);

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: MyArticleCard(
                item: item,
                onSubmitManuscript: () {},
              ),
            ),
          ),
        );
        expect(find.text(manuscriptActionSubmitAr), findsOneWidget);
        expect(find.text(manuscriptActionReviseAr), findsNothing);
      }
    });

    testWidgets('hides submit for pending/submitted/approved/published/rejected', (tester) async {
      final cases = <Map<String, dynamic>>[
        {
          'applicationId': 'pending',
          'portfolioStatus': 'awaiting_selection',
          'applicationStatus': 'pending',
          'canSubmit': false,
        },
        {
          'applicationId': 'submitted',
          'portfolioStatus': 'under_review',
          'applicationStatus': 'under_review',
          'reviewStatus': 'submitted',
          'canSubmit': true,
          'actions': [
            {'key': 'submit_manuscript'},
          ],
        },
        {
          'applicationId': 'approved',
          'portfolioStatus': 'accepted',
          'applicationStatus': 'approved',
          'canSubmit': true,
        },
        {
          'applicationId': 'published',
          'portfolioStatus': 'published_on_bildazo',
          'bildazoPublish': {'status': 'published', 'articleUrl': 'https://x.test/a'},
          'canSubmit': true,
        },
        {
          'applicationId': 'rejected',
          'portfolioStatus': 'rejected',
          'applicationStatus': 'rejected',
          'canSubmit': true,
        },
      ];

      for (final raw in cases) {
        final item = _item(raw);
        expect(item.showSubmitManuscriptAction, isFalse, reason: '${raw['applicationId']}');
        expect(item.showResubmitManuscriptAction, isFalse, reason: '${raw['applicationId']}');

        await tester.pumpWidget(
          MaterialApp(home: Scaffold(body: MyArticleCard(item: item))),
        );
        expect(find.text(manuscriptActionSubmitAr), findsNothing);
        expect(find.text(manuscriptActionReviseAr), findsNothing);
      }
    });

    testWidgets('respects canSubmit=false', (tester) async {
      final item = _item({
        'applicationId': 'no',
        'portfolioStatus': 'awaiting_execution',
        'applicationStatus': 'assigned',
        'canSubmit': false,
      });
      expect(item.showSubmitManuscriptAction, isFalse);

      await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: MyArticleCard(item: item))),
      );
      expect(find.text(manuscriptActionSubmitAr), findsNothing);
    });

    testWidgets('revision_requested shows إرسال التعديل and note', (tester) async {
      final item = _item({
        'applicationId': 'rev-1',
        'articleTitle': 'مقال للتعديل',
        'portfolioStatus': 'revision_requested',
        'revisionNote': 'أضف مصادر',
        'actions': [
          {'key': 'resubmit_manuscript'},
        ],
      });
      expect(item.showResubmitManuscriptAction, isTrue);
      expect(item.showSubmitManuscriptAction, isFalse);

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: MyArticleCard(
              item: item,
              onResubmitManuscript: () {},
            ),
          ),
        ),
      );
      expect(find.text(manuscriptActionReviseAr), findsOneWidget);
      expect(find.text('أضف مصادر'), findsOneWidget);
      expect(find.text(manuscriptActionSubmitAr), findsNothing);
    });
  });

  group('validation (M6)', () {
    test('empty manuscript blocked', () {
      expect(
        validateManuscriptForm(title: 'عنوان كاف', content: '   ', termsAccepted: true),
        manuscriptEmptyValidationAr,
      );
    });

    test('short content blocked (<50)', () {
      expect(
        validateManuscriptForm(title: 'عنوان كاف', content: 'قصير', termsAccepted: true),
        manuscriptTooShortValidationAr,
      );
    });

    test('terms required', () {
      final content = List.filled(60, 'ك').join();
      expect(
        validateManuscriptForm(title: 'عنوان كاف', content: content, termsAccepted: false),
        manuscriptTermsRequiredAr,
      );
    });

    test('valid form passes', () {
      final content = List.filled(60, 'ن').join();
      expect(
        validateManuscriptForm(title: 'عنوان كاف', content: content, termsAccepted: true),
        isNull,
      );
    });
  });

  group('error mapping (M6)', () {
    DioException dio({
      int? status,
      String? code,
      String? message,
      DioExceptionType type = DioExceptionType.badResponse,
    }) {
      Map<String, dynamic>? data;
      if (status != null) {
        data = <String, dynamic>{};
        if (code != null) data['publicCode'] = code;
        if (message != null) data['message'] = message;
      }
      return DioException(
        requestOptions: RequestOptions(path: '/freelancer/article-applications/1/final-manuscript'),
        type: type,
        response: status == null
            ? null
            : Response(
                requestOptions:
                    RequestOptions(path: '/freelancer/article-applications/1/final-manuscript'),
                statusCode: status,
                data: data,
              ),
      );
    }

    test('401/403 friendly Arabic', () {
      expect(manuscriptSubmitErrorMessage(dio(status: 401)), manuscriptForbiddenAr);
      expect(manuscriptSubmitErrorMessage(dio(status: 403)), manuscriptForbiddenAr);
    });

    test('not allowed / already submitted / revision', () {
      expect(
        manuscriptSubmitErrorMessage(
          dio(status: 409, code: 'ARTICLE_SUBMISSION_NOT_ALLOWED', message: 'تسليم المقال متاح بعد اختيارك فقط.'),
        ),
        manuscriptNotAllowedAr,
      );
      expect(
        manuscriptSubmitErrorMessage(
          dio(status: 409, code: 'ARTICLE_SUBMISSION_NOT_ALLOWED', message: 'تم اعتماد المقال ولا يمكن تعديله.'),
        ),
        manuscriptAlreadySubmittedAr,
      );
      expect(
        manuscriptSubmitErrorMessage(dio(status: 409, code: 'ARTICLE_SUBMISSION_NOT_REVISABLE')),
        manuscriptRevisionNotRequestedAr,
      );
    });

    test('network error', () {
      expect(
        manuscriptSubmitErrorMessage(dio(type: DioExceptionType.connectionError)),
        manuscriptNetworkErrorAr,
      );
    });
  });

  group('submit result parsing (M6)', () {
    test('parses success payload and missing optionals', () {
      final result = ManuscriptSubmitResult.fromResponse({
        'success': true,
        'data': {
          'created': true,
          'submission': {
            'id': '99',
            'applicationId': '12',
            'status': 'submitted',
            'submittedAt': '2026-08-01T00:00:00.000Z',
          },
        },
      });
      expect(result.created, isTrue);
      expect(result.status, 'submitted');
      expect(result.isUnderReview, isTrue);
      expect(result.applicationId, '12');

      expect(ManuscriptSubmitResult.fromResponse(null).status, isNull);
      expect(ManuscriptSubmitResult.fromResponse({}).status, isNull);
    });
  });

  group('ManuscriptSubmitScreen UI (M6)', () {
    testWidgets('shows empty validation on submit', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: ManuscriptSubmitScreen(
              args: ManuscriptSubmitArgs(
                applicationId: '1',
                articleTitle: 'عنوان المقال',
                isRevision: false,
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.byKey(const ValueKey('manuscript-submit-button')));
      await tester.pump();

      expect(find.text(manuscriptEmptyValidationAr), findsOneWidget);
    });

    testWidgets('revision screen shows notes and revision title', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: ManuscriptSubmitScreen(
              args: ManuscriptSubmitArgs(
                applicationId: '2',
                articleTitle: 'مقال',
                isRevision: true,
                revisionNote: 'وسّع المقدمة',
                statusLabelAr: 'مطلوب تعديل',
              ),
            ),
          ),
        ),
      );

      expect(find.text(manuscriptRevisionTitleAr), findsWidgets);
      expect(find.text('وسّع المقدمة'), findsOneWidget);
      expect(find.text(manuscriptRevisionButtonAr), findsWidgets);
    });

    testWidgets('successful first submission pops with first result', (tester) async {
      String? popped;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            myArticlesApiProvider.overrideWithValue(_OkManuscriptApi()),
          ],
          child: MaterialApp(
            home: Builder(
              builder: (context) {
                return Scaffold(
                  body: Center(
                    child: TextButton(
                      onPressed: () async {
                        popped = await Navigator.of(context).push<String>(
                          MaterialPageRoute<String>(
                            builder: (_) => const ManuscriptSubmitScreen(
                              args: ManuscriptSubmitArgs(
                                applicationId: '10',
                                articleTitle: 'مقال ناجح',
                                isRevision: false,
                              ),
                            ),
                          ),
                        );
                      },
                      child: const Text('open'),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      );

      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const ValueKey('manuscript-content-field')),
        List.filled(60, 'ن').join(),
      );
      await tester.ensureVisible(find.byType(Checkbox));
      await tester.tap(find.byType(Checkbox));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('manuscript-submit-button')));
      await tester.pumpAndSettle();

      expect(popped, 'first');
      expect(find.text('open'), findsOneWidget);
    });

    testWidgets('successful revision pops with revision result', (tester) async {
      String? popped;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            myArticlesApiProvider.overrideWithValue(_OkManuscriptApi()),
          ],
          child: MaterialApp(
            home: Builder(
              builder: (context) {
                return Scaffold(
                  body: Center(
                    child: TextButton(
                      onPressed: () async {
                        popped = await Navigator.of(context).push<String>(
                          MaterialPageRoute<String>(
                            builder: (_) => const ManuscriptSubmitScreen(
                              args: ManuscriptSubmitArgs(
                                applicationId: '11',
                                articleTitle: 'مقال',
                                isRevision: true,
                                revisionNote: 'ملاحظة',
                              ),
                            ),
                          ),
                        );
                      },
                      child: const Text('open'),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      );

      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('manuscript-submit-button')), findsOneWidget);

      await tester.enterText(
        find.byKey(const ValueKey('manuscript-content-field')),
        List.filled(60, 'ت').join(),
      );
      await tester.ensureVisible(find.byType(Checkbox));
      await tester.tap(find.byType(Checkbox));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('manuscript-submit-button')));
      await tester.pumpAndSettle();

      expect(popped, 'revision');
    });
  });
}

class _OkManuscriptApi extends MyArticlesApi {
  _OkManuscriptApi() : super(Dio());

  @override
  Future<MyArticlesSnapshot> listMyArticles({
    String? status,
    int limit = 50,
    int offset = 0,
  }) async {
    return const MyArticlesSnapshot();
  }

  @override
  Future<ManuscriptSubmitResult> submitFinalManuscript({
    required String applicationId,
    required String title,
    required String content,
    bool termsAccepted = true,
  }) async {
    return const ManuscriptSubmitResult(
      created: true,
      status: 'submitted',
      applicationId: '10',
    );
  }
}
