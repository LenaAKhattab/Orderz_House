import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/core/files/order_file_download_paths.dart';
import 'package:orderzhouse_app/features/client_orders/data/client_order_models.dart';
import 'package:orderzhouse_app/features/freelancer/data/freelancer_my_order_models.dart';
import 'package:orderzhouse_app/features/orders/data/order_file_models.dart';

void main() {
  group('sanitizeDownloadFileName', () {
    test('uses fallback when empty', () {
      expect(sanitizeDownloadFileName(null, fileId: '42'), 'order-file-42');
      expect(sanitizeDownloadFileName('   ', fileId: '7'), 'order-file-7');
    });

    test('blocks path traversal', () {
      expect(
        sanitizeDownloadFileName('../../etc/passwd', fileId: '1'),
        isNot(contains('..')),
      );
      expect(
        sanitizeDownloadFileName(r'folder\file.pdf', fileId: '2'),
        'file.pdf',
      );
    });

    test('replaces dangerous characters', () {
      final name = sanitizeDownloadFileName('bad<name>|file.pdf', fileId: '3');
      expect(name.contains('<'), isFalse);
      expect(name.contains('|'), isFalse);
      expect(name.endsWith('.pdf'), isTrue);
    });
  });

  group('buildOrderFileDownloadPath', () {
    test('client path has no token query', () {
      final path = buildOrderFileDownloadPath(
        role: OrderFileDownloadRole.client,
        orderId: '10',
        fileId: '55',
      );
      expect(path, '/client/orders/10/files/55/download');
      expect(path.contains('token'), isFalse);
      expect(path.contains('?'), isFalse);
    });

    test('freelancer path matches web scope', () {
      final path = buildOrderFileDownloadPath(
        role: OrderFileDownloadRole.freelancer,
        orderId: '8',
        fileId: '3',
      );
      expect(path, '/freelancer/my-orders/8/files/3/download');
    });
  });

  group('OrderFileDescriptor parsing', () {
    test('parses id and originalName from submission files', () {
      final files = parseOrderFilesFromSubmissionJson({
        'files': [
          {'id': '9', 'originalName': 'work.pdf', 'purpose': 'delivery'},
        ],
      });
      expect(files.length, 1);
      expect(files.first.id, '9');
      expect(files.first.displayName, 'work.pdf');
      expect(files.first.isDelivery, isTrue);
    });

    test('falls back to order-file id when name missing', () {
      final files = parseOrderFilesList([
        {'id': '12'},
      ]);
      expect(files.first.displayName, 'order-file-12');
    });
  });

  group('Client submission history files', () {
    test('parses downloadable files for client review', () {
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
                  'statusBadgeAr': 'تم التسليم',
                  'files': [
                    {'id': '101', 'originalName': 'delivery.zip'},
                  ],
                },
              ],
            },
          },
        },
      });

      expect(order.submissions.first.files.length, 1);
      expect(order.submissions.first.files.first.id, '101');
      expect(order.submissions.first.fileNames, ['delivery.zip']);
    });

    test('empty files list does not break parsing', () {
      final order = ClientOrder.fromJson({
        'id': '1',
        'title': 'طلب',
        'submissionHistory': {'submissions': []},
      });
      expect(order.submissions, isEmpty);
      expect(order.files, isEmpty);
    });
  });

  group('Freelancer order files', () {
    test('separates brief files from delivery', () {
      final order = FreelancerMyOrder.fromJson({
        'id': '5',
        'title': 'طلب',
        'files': [
          {'id': '1', 'originalName': 'brief.pdf', 'purpose': 'brief'},
          {'id': '2', 'originalName': 'work.pdf', 'purpose': 'delivery'},
        ],
      });
      expect(order.briefFiles.length, 1);
      expect(order.briefFiles.first.displayName, 'brief.pdf');
      expect(order.deliveryFilesFromOrder.length, 1);
    });

    test('submission history includes file ids', () {
      final submission = FreelancerOrderSubmission.fromJson({
        'id': '7',
        'files': [
          {'id': '88', 'originalName': 'final.pdf', 'purpose': 'delivery'},
        ],
      });
      expect(submission.files.first.id, '88');
    });
  });
}
