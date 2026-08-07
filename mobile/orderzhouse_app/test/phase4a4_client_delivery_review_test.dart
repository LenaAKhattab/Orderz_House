import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/features/auth/domain/auth_user.dart';
import 'package:orderzhouse_app/features/client_orders/data/client_delivery_review_api.dart';
import 'package:orderzhouse_app/features/client_orders/data/client_delivery_review_models.dart';
import 'package:orderzhouse_app/features/client_orders/data/client_order_models.dart';

void main() {
  group('Approve delivery', () {
    test('request has no body', () async {
      dynamic capturedData;
      final dio = Dio(BaseOptions(baseUrl: 'http://test'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            capturedData = options.data;
            handler.resolve(
              Response(
                requestOptions: options,
                data: {
                  'success': true,
                  'data': {
                    'order': {'id': 8, 'title': 'طلب', 'orderStatus': 'completed'},
                  },
                },
              ),
            );
          },
        ),
      );

      final api = ClientDeliveryReviewApi(dio);
      final order = await api.approveDelivery('8');
      expect(capturedData, isNull);
      expect(order.orderStatus, 'completed');
    });
  });

  group('Revision request payload', () {
    test('toJson contains note only', () {
      const payload = RequestDeliveryRevisionPayload(note: 'عدّل الألوان من فضلك');
      final json = payload.toJson();
      expect(json.keys, ['note']);
      expect(json.containsKey('userId'), isFalse);
      expect(json.containsKey('clientId'), isFalse);
      expect(json.containsKey('status'), isFalse);
      expect(json.containsKey('orderStatus'), isFalse);
      expect(json.containsKey('freelancerId'), isFalse);
    });

    test('api posts note json only', () async {
      Map<String, dynamic>? capturedData;
      final dio = Dio(BaseOptions(baseUrl: 'http://test'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            capturedData = options.data as Map<String, dynamic>?;
            handler.resolve(
              Response(
                requestOptions: options,
                data: {
                  'success': true,
                  'data': {
                    'order': {'id': 8, 'title': 'طلب', 'orderStatus': 'in_progress'},
                  },
                },
              ),
            );
          },
        ),
      );

      final api = ClientDeliveryReviewApi(dio);
      await api.requestRevision(
        '8',
        const RequestDeliveryRevisionPayload(note: 'يرجى تعديل الخطوط والهوامش'),
      );

      expect(capturedData, isNotNull);
      final data = capturedData!;
      expect(data.keys, ['note']);
      expect(data.containsKey('userId'), isFalse);
      expect(data.containsKey('status'), isFalse);
    });
  });

  group('Revision note validation', () {
    test('rejects empty note', () {
      expect(validateDeliveryRevisionNote(''), isNotNull);
      expect(validateDeliveryRevisionNote('   '), isNotNull);
    });

    test('rejects short note', () {
      expect(validateDeliveryRevisionNote('قصير'), isNotNull);
    });

    test('accepts valid note', () {
      expect(validateDeliveryRevisionNote('يرجى تعديل الألوان والخط'), isNull);
    });
  });

  group('canReviewDelivery by status', () {
    test('approve only pending_client_review with files', () {
      final pending = ClientOrder(
        id: '1',
        title: 'طلب',
        orderStatus: 'pending_client_review',
        submissions: const [
          ClientOrderSubmissionSummary(id: '9', filesCount: 2),
        ],
      );
      expect(clientCanApproveDelivery(pending), isTrue);
      expect(clientCanRequestRevision(pending), isTrue);

      final noFiles = ClientOrder(
        id: '2',
        title: 'طلب',
        orderStatus: 'pending_client_review',
        submissions: const [ClientOrderSubmissionSummary(id: '9', filesCount: 0)],
      );
      expect(clientCanApproveDelivery(noFiles), isFalse);
    });

    test('blocks approve for completed', () {
      final order = ClientOrder(
        id: '1',
        title: 'طلب',
        orderStatus: 'completed',
        submissions: const [ClientOrderSubmissionSummary(filesCount: 1)],
      );
      expect(clientCanApproveDelivery(order), isFalse);
      expect(clientCanRequestRevision(order), isFalse);
    });

    test('waiting message for in_progress', () {
      final order = ClientOrder(id: '1', title: 'طلب', orderStatus: 'assigned');
      expect(clientDeliveryReviewHeadlineAr(order), contains('بانتظار تسليم'));
    });
  });

  group('Submission history parsing', () {
    test('parses delivery summary with files and badges', () {
      final order = ClientOrder.fromResponse({
        'success': true,
        'data': {
          'order': {
            'id': 3,
            'title': 'تصميم',
            'orderStatus': 'pending_client_review',
            'submissionHistory': {
              'submissions': [
                {
                  'id': '11',
                  'status': 'submitted',
                  'statusBadgeAr': 'تم التسليم',
                  'submittedAt': '2026-02-01T10:00:00.000Z',
                  'files': [
                    {'id': '101', 'originalName': 'work.pdf'},
                    {'id': '102', 'originalName': 'preview.png'},
                  ],
                },
              ],
            },
          },
        },
      });

      expect(order.submissions.length, 1);
      final sub = order.submissions.first;
      expect(sub.displayStatus, 'تم التسليم');
      expect(sub.filesCount, 2);
      expect(sub.fileNames, ['work.pdf', 'preview.png']);
    });
  });

  group('Role visibility', () {
    test('client sees review actions capability flags', () {
      const client = AuthUser(id: '1', email: 'c@x.com', primaryRole: 'client', roles: ['client']);
      const freelancer = AuthUser(id: '2', email: 'f@x.com', primaryRole: 'freelancer', roles: ['freelancer']);

      expect(client.usesClientExperience, isTrue);
      expect(freelancer.usesClientExperience, isFalse);

      final reviewOrder = ClientOrder(
        id: '1',
        title: 'طلب',
        orderStatus: 'pending_client_review',
        submissions: const [ClientOrderSubmissionSummary(filesCount: 1)],
      );
      expect(clientCanApproveDelivery(reviewOrder), isTrue);
    });
  });
}
