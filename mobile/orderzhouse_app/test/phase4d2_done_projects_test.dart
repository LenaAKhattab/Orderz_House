import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/features/freelancer/financial_claims/data/done_project_models.dart';
import 'package:orderzhouse_app/features/freelancer/financial_claims/data/financial_claim_api.dart';

DoneProject _sampleDoneProject({
  double? totalPriceSnapshot,
  String? actualCompletionDate,
  bool hasMissingCompletionDate = false,
  int? durationMinutes,
  String? paymentStatus,
}) {
  return DoneProject(
    projectId: '123',
    orderNumber: 'ORD-100',
    requestTitle: 'تصميم موقع',
    orderStatus: 'completed',
    sourceType: 'client_created',
    categories: const ['تصميم', 'برمجة'],
    actualCompletionDate: actualCompletionDate,
    durationMinutes: durationMinutes,
    totalPriceSnapshot: totalPriceSnapshot,
    currencyCode: 'JOD',
    paymentStatus: paymentStatus,
    hasMissingCompletionDate: hasMissingCompletionDate,
  );
}

void main() {
  group('DoneProject parsing', () {
    test('parseListResponse reads projects array (camelCase)', () {
      final projects = DoneProject.parseListResponse({
        'success': true,
        'data': {
          'projects': [
            {
              'projectId': '10',
              'orderNumber': 'ORD-10',
              'requestTitle': 'شعار',
              'orderStatus': 'completed',
              'sourceType': 'client_created',
              'categories': ['تصميم'],
              'actualCompletionDate': '2026-05-01',
              'durationMinutes': 90,
              'totalPriceSnapshot': 50,
              'currencyCode': 'JOD',
              'paymentStatus': 'paid',
              'hasMissingCompletionDate': false,
            },
          ],
        },
      });

      expect(projects, hasLength(1));
      expect(projects.first.projectId, '10');
      expect(projects.first.orderNumber, 'ORD-10');
      expect(projects.first.requestTitle, 'شعار');
      expect(projects.first.categories, ['تصميم']);
      expect(projects.first.totalPriceSnapshot, 50);
      expect(projects.first.currencyCode, 'JOD');
    });

    test('parseListResponse supports doneProjects key fallback', () {
      final projects = DoneProject.parseListResponse({
        'success': true,
        'data': {
          'doneProjects': [
            {
              'projectId': '2',
              'orderNumber': 'X',
              'requestTitle': 'Y',
            },
          ],
        },
      });
      expect(projects, hasLength(1));
      expect(projects.first.projectId, '2');
    });

    test('fromJson supports snake_case fields', () {
      final project = DoneProject.fromJson({
        'project_id': '8',
        'order_number': 'ORD-SN',
        'request_title': 'اختبار',
        'order_status': 'completed',
        'source_type': 'admin_created',
        'categories': ['تسويق'],
        'actual_completion_date': null,
        'duration_minutes': 45,
        'total_price_snapshot': null,
        'currency_code': 'JOD',
        'payment_status': 'pending',
        'has_missing_completion_date': true,
      });

      expect(project.projectId, '8');
      expect(project.actualCompletionDate, isNull);
      expect(project.totalPriceSnapshot, isNull);
      expect(project.hasMissingCompletionDate, isTrue);
      expect(project.durationMinutes, 45);
    });
  });

  group('Null tolerance', () {
    test('amount and date formatters handle null', () {
      final project = _sampleDoneProject(
        totalPriceSnapshot: null,
        actualCompletionDate: null,
      );
      expect(formatDoneProjectAmount(project), '—');
    });

    test('empty projects list is valid empty state', () {
      expect(DoneProject.parseListResponse({'success': true, 'data': {'projects': []}}), isEmpty);
    });
  });

  group('Labels', () {
    test('formatDurationMinutesLabel', () {
      expect(formatDurationMinutesLabel(null), '—');
      expect(formatDurationMinutesLabel(0), '0 دقيقة');
      expect(formatDurationMinutesLabel(45), '45 دقيقة');
      expect(formatDurationMinutesLabel(60), '1 ساعة');
      expect(formatDurationMinutesLabel(90), '1 ساعة و 30 دقيقة');
    });

    test('doneProjectPaymentStatusLabelAr', () {
      expect(doneProjectPaymentStatusLabelAr('paid'), 'مدفوع');
      expect(doneProjectPaymentStatusLabelAr('pending'), 'بانتظار الدفع');
      expect(doneProjectPaymentStatusLabelAr(null), '—');
    });

    test('formatDoneProjectAmount with currency', () {
      final project = _sampleDoneProject(totalPriceSnapshot: 120);
      expect(formatDoneProjectAmount(project), '120 JOD');
    });

    test('formatDoneProjectCategories', () {
      expect(formatDoneProjectCategories(const []), '—');
      expect(formatDoneProjectCategories(const ['أ', 'ب']), 'أ، ب');
    });
  });

  group('FinancialClaimApi done-projects read-only', () {
    test('fetchDoneProjects uses GET with q and limit query params', () async {
      String? method;
      String? path;
      Map<String, dynamic>? query;
      dynamic capturedData;

      final dio = Dio(BaseOptions(baseUrl: 'http://test'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            method = options.method;
            path = options.path;
            query = options.queryParameters;
            capturedData = options.data;
            handler.resolve(
              Response(
                requestOptions: options,
                data: {
                  'success': true,
                  'data': {
                    'projects': [
                      {
                        'projectId': '1',
                        'orderNumber': 'ORD-1',
                        'requestTitle': 'اختبار',
                        'orderStatus': 'completed',
                      },
                    ],
                  },
                },
              ),
            );
          },
        ),
      );

      final api = FinancialClaimApi(dio);
      final projects = await api.fetchDoneProjects(q: 'ORD', limit: 100);

      expect(method, 'GET');
      expect(path, '/portal/financial-claims/done-projects');
      expect(query?['q'], 'ORD');
      expect(query?['limit'], 100);
      expect(capturedData, isNull);
      expect(projects, hasLength(1));
    });

    test('fetchDoneProjects omits empty q param', () async {
      Map<String, dynamic>? query;
      final dio = Dio(BaseOptions(baseUrl: 'http://test'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            query = options.queryParameters;
            handler.resolve(
              Response(
                requestOptions: options,
                data: {'success': true, 'data': {'projects': []}},
              ),
            );
          },
        ),
      );

      await FinancialClaimApi(dio).fetchDoneProjects();
      expect(query?.containsKey('q'), isFalse);
      expect(query?['limit'], 100);
    });

    test('createDoneProjectClaim is the only POST helper (no manual claim)', () {
      final api = FinancialClaimApi(Dio());
      expect(api.fetchDoneProjects, isA<Function>());
      expect(api.createDoneProjectClaim, isA<Function>());
      expect(() => (api as dynamic).createFinancialClaim, throwsNoSuchMethodError);
      expect(() => (api as dynamic).createManualClaim, throwsNoSuchMethodError);
    });
  });
}
