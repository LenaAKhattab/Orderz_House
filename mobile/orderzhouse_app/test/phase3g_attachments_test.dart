import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/features/client_orders/data/create_order_form_data.dart';
import 'package:orderzhouse_app/features/client_orders/data/create_order_models.dart';
import 'package:orderzhouse_app/features/client_orders/data/order_attachment_limits.dart';
import 'package:orderzhouse_app/features/client_orders/data/order_attachment_models.dart';

void main() {
  const fixedDraft = CreateOrderDraft(
    projectType: 'fixed',
    categoryId: '3',
    title: 'تصميم شعار',
    description: 'وصف كافٍ للطلب هنا',
    durationValue: '5',
    budget: '150',
  );

  const biddingDraft = CreateOrderDraft(
    projectType: 'bidding',
    categoryId: '2',
    title: 'تطوير موقع',
    description: 'وصف كافٍ للطلب هنا',
    durationValue: '7',
    bidBudgetMin: '100',
    bidBudgetMax: '300',
  );

  group('JSON payload without files', () {
    test('excludes userId status paymentStatus assignedFreelancerId', () {
      final payload = buildCreateOrderPayload(fixedDraft);
      expect(payload.containsKey('userId'), isFalse);
      expect(payload.containsKey('status'), isFalse);
      expect(payload.containsKey('paymentStatus'), isFalse);
      expect(payload.containsKey('assignedFreelancerId'), isFalse);
      expect(payload.containsKey('stripeSecretKey'), isFalse);
    });

    test('fixed draft includes budget', () {
      final payload = buildCreateOrderPayload(fixedDraft);
      expect(payload['projectType'], 'fixed');
      expect(payload['budget'], 150.0);
    });

    test('bidding draft includes bid range', () {
      final payload = buildCreateOrderPayload(biddingDraft);
      expect(payload['projectType'], 'bidding');
      expect(payload['bidBudgetMin'], 100.0);
      expect(payload['bidBudgetMax'], 300.0);
    });
  });

  group('FormData field names', () {
    test('fixed order uses web-aligned field names', () {
      final names = createOrderFormDataFieldNames(fixedDraft);
      expect(names, containsAll(['title', 'description', 'categoryId', 'projectType', 'budget']));
      expect(names, isNot(contains('userId')));
      expect(names, isNot(contains('status')));
    });

    test('bidding order uses bid budget fields not fixed budget', () {
      final names = createOrderFormDataFieldNames(biddingDraft);
      expect(names, containsAll(['bidBudgetMin', 'bidBudgetMax']));
      expect(names, isNot(contains('budget')));
    });

    test('multipart uses files field name', () {
      expect(orderAttachmentFormFieldName, 'files');
    });

    test('FormData with attachments registers files under files', () async {
      final attachment = SelectedOrderAttachment(
        id: '1',
        name: 'brief.pdf',
        size: 4,
        bytes: Uint8List.fromList([1, 2, 3, 4]),
      );
      final formData = await buildCreateOrderFormData(fixedDraft, [attachment]);
      expect(formData.fields.map((e) => e.key), contains('title'));
      expect(formData.fields.map((e) => e.key), isNot(contains('userId')));
      expect(formData.files.length, 1);
      expect(formData.files.first.key, 'files');
      expect(formData.files.first.value.filename, 'brief.pdf');
    });
  });

  group('Attachment validation', () {
    test('empty list is valid (optional)', () {
      expect(validateOrderAttachments(const []).isValid, isTrue);
    });

    test('rejects more than 5 files', () {
      final files = List.generate(
        6,
        (i) => OrderAttachmentDraft(name: 'f$i.pdf', size: 100),
      );
      final result = validateOrderAttachments(files);
      expect(result.isValid, isFalse);
      expect(result.message, orderAttachmentCountMessageAr);
    });

    test('rejects total size over 5MB', () {
      final files = [
        OrderAttachmentDraft(name: 'a.pdf', size: 3 * 1024 * 1024),
        OrderAttachmentDraft(name: 'b.pdf', size: 3 * 1024 * 1024),
      ];
      final result = validateOrderAttachments(files);
      expect(result.isValid, isFalse);
      expect(result.message, orderAttachmentTotalSizeMessageAr);
    });

    test('rejects dangerous extension', () {
      final result = validateOrderAttachments([
        const OrderAttachmentDraft(name: 'virus.exe', size: 10),
      ]);
      expect(result.isValid, isFalse);
      expect(result.message, orderAttachmentTypeMessageAr);
    });

    test('accepts allowed pdf within limits', () {
      final result = validateOrderAttachments([
        const OrderAttachmentDraft(name: 'notes.pdf', size: 1024),
      ]);
      expect(result.isValid, isTrue);
    });
  });
}
