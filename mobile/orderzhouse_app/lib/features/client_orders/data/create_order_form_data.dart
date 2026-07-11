import 'package:dio/dio.dart';

import 'create_order_models.dart';
import 'order_attachment_limits.dart';
import 'order_attachment_models.dart';

/// Builds multipart body matching web `AdminInternalOrderWizard` field names.
Future<FormData> buildCreateOrderFormData(
  CreateOrderDraft draft,
  List<SelectedOrderAttachment> attachments,
) async {
  final payload = buildCreateOrderPayload(draft);
  final formData = FormData();

  void addField(String key, Object value) {
    formData.fields.add(MapEntry(key, value.toString()));
  }

  addField('title', payload['title']);
  addField('description', payload['description']);
  addField('categoryId', payload['categoryId']);
  addField('projectType', payload['projectType']);
  addField('durationValue', payload['durationValue']);
  addField('durationUnit', payload['durationUnit']);

  if (payload.containsKey('subSubcategoryId')) {
    addField('subSubcategoryId', payload['subSubcategoryId']);
  }

  if (payload.containsKey('budget')) {
    addField('budget', payload['budget']);
  }
  if (payload.containsKey('bidBudgetMin')) {
    addField('bidBudgetMin', payload['bidBudgetMin']);
  }
  if (payload.containsKey('bidBudgetMax')) {
    addField('bidBudgetMax', payload['bidBudgetMax']);
  }

  for (final file in attachments) {
    formData.files.add(
      MapEntry(orderAttachmentFormFieldName, await file.toMultipartFile()),
    );
  }

  assert(!formData.fields.any((e) => e.key == 'userId'));
  assert(!formData.fields.any((e) => e.key == 'status'));
  assert(!formData.fields.any((e) => e.key == 'paymentStatus'));
  assert(!formData.fields.any((e) => e.key == 'assignedFreelancerId'));

  return formData;
}

/// Exposes field names for tests without performing I/O.
List<String> createOrderFormDataFieldNames(CreateOrderDraft draft) {
  final payload = buildCreateOrderPayload(draft);
  final names = <String>[
    'title',
    'description',
    'categoryId',
    'projectType',
    'durationValue',
    'durationUnit',
  ];
  if (payload.containsKey('subSubcategoryId')) names.add('subSubcategoryId');
  if (payload.containsKey('budget')) names.add('budget');
  if (payload.containsKey('bidBudgetMin')) names.add('bidBudgetMin');
  if (payload.containsKey('bidBudgetMax')) names.add('bidBudgetMax');
  return names;
}
