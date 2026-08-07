import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/features/freelancer/financial_claims/data/financial_claim_api.dart';
import 'package:orderzhouse_app/features/freelancer/financial_claims/data/financial_claim_models.dart';

FinancialClaim _sampleClaim({
  String id = '1',
  String? status,
  String? payoutStatus,
  double? totalPriceSnapshot,
  double? userAmountSnapshot,
}) {
  return FinancialClaim(
    id: id,
    projectId: '10',
    orderNumber: 'ORD-001',
    requestTitle: 'تصميم شعار',
    categories: const ['تصميم'],
    durationMinutes: 120,
    actualCompletionDate: '2026-05-01',
    status: status,
    payoutStatus: payoutStatus,
    totalPriceSnapshot: totalPriceSnapshot,
    userAmountSnapshot: userAmountSnapshot,
    paidAmount: 0,
    remainingAmount: userAmountSnapshot,
    submittedAt: '2026-05-02T10:00:00.000Z',
    payoutWindowStart: '2026-06-01',
    payoutWindowEnd: '2026-06-10',
  );
}

void main() {
  group('FinancialClaim parsing', () {
    test('parseListResponse reads claims array (camelCase)', () {
      final claims = FinancialClaim.parseListResponse({
        'success': true,
        'data': {
          'claims': [
            {
              'id': '42',
              'freelancerId': '7',
              'projectId': '123',
              'orderNumber': 'ORD-99',
              'requestTitle': 'موقع إلكتروني',
              'categories': ['برمجة'],
              'durationMinutes': 300,
              'actualCompletionDate': '2026-04-01',
              'status': 'pending',
              'payoutStatus': 'not_due_yet',
              'totalPriceSnapshot': null,
              'userAmountSnapshot': null,
              'paidAmount': 0,
              'remainingAmount': 0,
              'submittedAt': '2026-04-02T00:00:00.000Z',
              'payoutWindowStart': '2026-05-01',
              'payoutWindowEnd': '2026-05-10',
            },
          ],
        },
      });

      expect(claims, hasLength(1));
      expect(claims.first.id, '42');
      expect(claims.first.orderNumber, 'ORD-99');
      expect(claims.first.requestTitle, 'موقع إلكتروني');
      expect(claims.first.categories, ['برمجة']);
      expect(claims.first.totalPriceSnapshot, isNull);
      expect(claims.first.userAmountSnapshot, isNull);
      expect(claims.first.hasAdminPricing, isFalse);
    });

    test('fromJson supports snake_case fields', () {
      final claim = FinancialClaim.fromJson({
        'id': '5',
        'project_id': '8',
        'order_number': 'ORD-SN',
        'request_title': 'اختبار',
        'categories': ['تسويق'],
        'duration_minutes': 60,
        'actual_completion_date': '2026-03-01',
        'status': 'accepted',
        'payout_status': 'within_payout_window',
        'total_price_snapshot': 100,
        'user_amount_snapshot': 70,
        'paid_amount': 0,
        'remaining_amount': 70,
        'submitted_at': '2026-03-02T00:00:00.000Z',
        'payout_window_start': '2026-04-01',
        'payout_window_end': '2026-04-10',
      });

      expect(claim.projectId, '8');
      expect(claim.totalPriceSnapshot, 100);
      expect(claim.userAmountSnapshot, 70);
      expect(claim.hasAdminPricing, isTrue);
    });

    test('model does not expose freelancerId field', () {
      final claim = FinancialClaim.fromJson({
        'id': '1',
        'freelancerId': '999',
        'freelancer_id': '888',
        'orderNumber': 'X',
        'requestTitle': 'Y',
      });
      expect(claim.id, '1');
      expect(claim, isA<FinancialClaim>());
      // Ensure no freelancerId getter via reflection-like check on toString
      expect(claim.toString(), isNot(contains('freelancerId')));
      expect(claim.toString(), isNot(contains('999')));
    });
  });

  group('Null amount handling', () {
    test('hasAdminPricing is false when amounts are null', () {
      final claim = _sampleClaim(totalPriceSnapshot: null, userAmountSnapshot: null);
      expect(claim.hasAdminPricing, isFalse);
    });

    test('hasAdminPricing is true when both amounts exist', () {
      final claim = _sampleClaim(totalPriceSnapshot: 50, userAmountSnapshot: 35);
      expect(claim.hasAdminPricing, isTrue);
      expect(formatFinancialAmount(claim.totalPriceSnapshot), '50 JOD');
      expect(formatFinancialAmount(claim.userAmountSnapshot), '35 JOD');
    });
  });

  group('Grouping logic', () {
    test('pending -> underReview', () {
      final claim = _sampleClaim(status: 'pending', payoutStatus: 'not_due_yet');
      expect(classifyFinancialClaim(claim), FinancialClaimGroup.underReview);
    });

    test('rejected/frozen/requires_in_person_review -> blocked', () {
      expect(
        classifyFinancialClaim(_sampleClaim(status: 'rejected')),
        FinancialClaimGroup.blocked,
      );
      expect(
        classifyFinancialClaim(_sampleClaim(status: 'frozen')),
        FinancialClaimGroup.blocked,
      );
      expect(
        classifyFinancialClaim(_sampleClaim(status: 'requires_in_person_review')),
        FinancialClaimGroup.blocked,
      );
    });

    test('paid status or payoutStatus -> paid', () {
      expect(
        classifyFinancialClaim(_sampleClaim(status: 'paid', payoutStatus: 'within_payout_window')),
        FinancialClaimGroup.paid,
      );
      expect(
        classifyFinancialClaim(_sampleClaim(status: 'accepted', payoutStatus: 'paid')),
        FinancialClaimGroup.paid,
      );
    });

    test('not_due_yet/missing_completion_date -> notDue', () {
      expect(
        classifyFinancialClaim(_sampleClaim(status: 'accepted', payoutStatus: 'not_due_yet')),
        FinancialClaimGroup.notDue,
      );
      expect(
        classifyFinancialClaim(_sampleClaim(status: 'accepted', payoutStatus: 'missing_completion_date')),
        FinancialClaimGroup.notDue,
      );
    });

    test('accepted within window -> due', () {
      expect(
        classifyFinancialClaim(_sampleClaim(status: 'accepted', payoutStatus: 'within_payout_window')),
        FinancialClaimGroup.due,
      );
      expect(
        classifyFinancialClaim(_sampleClaim(status: 'accepted', payoutStatus: 'late_after_payout_window')),
        FinancialClaimGroup.due,
      );
    });

    test('groupFinancialClaims partitions all claims', () {
      final claims = [
        _sampleClaim(id: '1', status: 'pending'),
        _sampleClaim(id: '2', status: 'rejected'),
        _sampleClaim(id: '3', status: 'paid'),
        _sampleClaim(id: '4', status: 'accepted', payoutStatus: 'not_due_yet'),
        _sampleClaim(id: '5', status: 'accepted', payoutStatus: 'within_payout_window'),
      ];
      final grouped = groupFinancialClaims(claims);
      expect(grouped[FinancialClaimGroup.underReview], hasLength(1));
      expect(grouped[FinancialClaimGroup.blocked], hasLength(1));
      expect(grouped[FinancialClaimGroup.paid], hasLength(1));
      expect(grouped[FinancialClaimGroup.notDue], hasLength(1));
      expect(grouped[FinancialClaimGroup.due], hasLength(1));
    });

    test('filterFinancialClaims applies chip filters', () {
      final claims = [
        _sampleClaim(id: '1', status: 'pending'),
        _sampleClaim(id: '2', status: 'accepted', payoutStatus: 'within_payout_window'),
        _sampleClaim(id: '3', status: 'paid'),
        _sampleClaim(id: '4', status: 'rejected'),
      ];
      expect(filterFinancialClaims(claims, FinancialClaimFilter.all), hasLength(4));
      expect(filterFinancialClaims(claims, FinancialClaimFilter.underReview), hasLength(1));
      expect(filterFinancialClaims(claims, FinancialClaimFilter.due), hasLength(1));
      expect(filterFinancialClaims(claims, FinancialClaimFilter.paid), hasLength(1));
      expect(filterFinancialClaims(claims, FinancialClaimFilter.blocked), hasLength(1));
    });
  });

  group('Arabic labels', () {
    test('status labels', () {
      expect(financialClaimStatusLabelAr('pending'), 'قيد المراجعة');
      expect(financialClaimStatusLabelAr('accepted'), 'مقبولة');
      expect(financialClaimStatusLabelAr('rejected'), 'مرفوضة');
      expect(financialClaimStatusLabelAr('paid'), 'مدفوعة');
    });

    test('payout status labels', () {
      expect(financialClaimPayoutStatusLabelAr('not_due_yet'), 'غير مستحقة بعد');
      expect(financialClaimPayoutStatusLabelAr('within_payout_window'), 'ضمن نافذة الدفع');
      expect(financialClaimPayoutStatusLabelAr('paid'), 'مدفوعة');
    });

    test('group and filter labels', () {
      expect(financialClaimGroupLabelAr(FinancialClaimGroup.due), contains('مستحقة'));
      expect(financialClaimFilterLabelAr(FinancialClaimFilter.blocked), contains('محظورة'));
    });
  });

  group('FinancialClaimApi read-only', () {
    test('fetchClaims uses GET without body', () async {
      String? method;
      dynamic capturedData;
      final dio = Dio(BaseOptions(baseUrl: 'http://test'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            method = options.method;
            capturedData = options.data;
            handler.resolve(
              Response(
                requestOptions: options,
                data: {
                  'success': true,
                  'data': {
                    'claims': [
                      {
                        'id': '1',
                        'orderNumber': 'ORD-1',
                        'requestTitle': 'اختبار',
                        'status': 'pending',
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
      final claims = await api.fetchClaims();

      expect(method, 'GET');
      expect(capturedData, isNull);
      expect(claims, hasLength(1));
    });

    test('FinancialClaimApi has no POST helper methods', () {
      final api = FinancialClaimApi(Dio());
      expect(api.fetchClaims, isA<Function>());
      expect(() => (api as dynamic).createClaim, throwsNoSuchMethodError);
      expect(() => (api as dynamic).postClaim, throwsNoSuchMethodError);
    });
  });

  group('Summary', () {
    test('FinancialClaimsSummary counts groups', () {
      final claims = [
        _sampleClaim(id: '1', status: 'pending'),
        _sampleClaim(id: '2', status: 'paid'),
        _sampleClaim(id: '3', status: 'accepted', payoutStatus: 'within_payout_window'),
      ];
      final summary = FinancialClaimsSummary.fromClaims(claims);
      expect(summary.total, 3);
      expect(summary.underReview, 1);
      expect(summary.paid, 1);
      expect(summary.due, 1);
    });
  });
}
