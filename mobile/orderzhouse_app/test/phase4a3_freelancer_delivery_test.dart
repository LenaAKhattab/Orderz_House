import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/features/client_orders/data/order_attachment_limits.dart';
import 'package:orderzhouse_app/features/client_orders/data/order_attachment_models.dart';
import 'package:orderzhouse_app/features/freelancer/data/freelancer_delivery_api.dart';
import 'package:orderzhouse_app/features/freelancer/data/freelancer_delivery_models.dart';
import 'package:orderzhouse_app/features/freelancer/data/freelancer_my_order_models.dart';

void main() {
  group('Delivery FormData', () {
    test('contains files field only', () async {
      final attachments = [
        SelectedOrderAttachment(
          id: '1',
          name: 'work.pdf',
          size: 1024,
          bytes: Uint8List.fromList([1, 2, 3]),
        ),
      ];
      final formData = await buildFreelancerDeliveryFormData(attachments);
      expect(formData.fields, isEmpty);
      expect(formData.files.length, 1);
      expect(formData.files.first.key, orderAttachmentFormFieldName);
      expect(formData.files.first.value.filename, 'work.pdf');
    });

    test('field names list has no identity or status keys', () {
      final attachments = [
        SelectedOrderAttachment(
          id: '1',
          name: 'a.pdf',
          size: 10,
          bytes: Uint8List.fromList([1]),
        ),
      ];
      final names = freelancerDeliveryFormFieldNames(attachments);
      expect(names, ['files']);
      expect(names.contains('userId'), isFalse);
      expect(names.contains('freelancerId'), isFalse);
      expect(names.contains('status'), isFalse);
      expect(names.contains('orderStatus'), isFalse);
    });
  });

  group('Delivery validation', () {
    test('rejects zero files', () {
      final result = validateDeliveryAttachments(const []);
      expect(result.isValid, isFalse);
      expect(result.message, deliveryAttachmentRequiredMessageAr);
    });

    test('rejects unsupported extension', () {
      final result = validateDeliveryAttachments([
        const OrderAttachmentDraft(name: 'virus.exe', size: 100),
      ]);
      expect(result.isValid, isFalse);
    });

    test('accepts valid pdf attachment', () {
      final result = validateDeliveryAttachments([
        const OrderAttachmentDraft(name: 'delivery.pdf', size: 1024),
      ]);
      expect(result.isValid, isTrue);
    });
  });

  group('Delivery response parsing', () {
    test('fromResponse parses order after delivery', () {
      final order = FreelancerMyOrder.fromResponse({
        'success': true,
        'data': {
          'order': {
            'id': 12,
            'title': 'تصميم',
            'orderStatus': 'pending_client_review',
            'submissionHistory': {
              'submissions': [
                {
                  'id': '3',
                  'status': 'submitted',
                  'statusBadgeAr': 'تم التسليم',
                  'submittedAt': '2026-02-01T10:00:00.000Z',
                  'files': [
                    {'id': '1'},
                    {'id': '2'},
                  ],
                },
              ],
            },
          },
        },
      });
      expect(order.orderStatus, 'pending_client_review');
      expect(order.submissionHistory?.submissions.length, 1);
      expect(order.submissionHistory?.submissions.first.filesCount, 2);
    });
  });

  group('canDeliver by status', () {
    test('allows in_progress assigned ready_for_work', () {
      for (final status in ['in_progress', 'assigned', 'ready_for_work']) {
        final order = FreelancerMyOrder(id: '1', title: 'طلب', orderStatus: status);
        expect(freelancerCanDeliverOrder(order), isTrue, reason: status);
      }
    });

    test('blocks pending_client_review completed cancelled', () {
      for (final status in ['pending_client_review', 'completed', 'cancelled']) {
        final order = FreelancerMyOrder(id: '1', title: 'طلب', orderStatus: status);
        expect(freelancerCanDeliverOrder(order), isFalse, reason: status);
      }
    });

    test('blocked messages for key statuses', () {
      expect(
        freelancerDeliveryBlockedMessageAr(
          const FreelancerMyOrder(id: '1', title: 'طلب', orderStatus: 'pending_client_review'),
        ),
        contains('مراجعة العميل'),
      );
      expect(
        freelancerDeliveryBlockedMessageAr(
          const FreelancerMyOrder(id: '1', title: 'طلب', orderStatus: 'completed'),
        ),
        contains('إكمال'),
      );
      expect(
        freelancerDeliveryBlockedMessageAr(
          const FreelancerMyOrder(id: '1', title: 'طلب', orderStatus: 'cancelled'),
        ),
        contains('ملغي'),
      );
    });
  });

  group('FreelancerDeliveryApi', () {
    test('posts multipart with files only', () async {
      Map<String, dynamic> capturedFields = {};
      List<String> capturedFileKeys = [];
      final dio = Dio(BaseOptions(baseUrl: 'http://test'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            final data = options.data;
            if (data is FormData) {
              capturedFields = {for (final f in data.fields) f.key: f.value};
              capturedFileKeys = data.files.map((e) => e.key).toList();
            }
            handler.resolve(
              Response(
                requestOptions: options,
                data: {
                  'success': true,
                  'data': {
                    'order': {'id': 5, 'title': 'طلب', 'orderStatus': 'pending_client_review'},
                  },
                },
              ),
            );
          },
        ),
      );

      final api = FreelancerDeliveryApi(dio);
      final formData = FormData();
      formData.files.add(
        MapEntry('files', MultipartFile.fromBytes([1, 2], filename: 'work.pdf')),
      );
      await api.submitDelivery('5', formData);

      expect(capturedFields, isEmpty);
      expect(capturedFileKeys, ['files']);
      expect(capturedFileKeys.contains('userId'), isFalse);
      expect(capturedFileKeys.contains('status'), isFalse);
    });
  });
}
