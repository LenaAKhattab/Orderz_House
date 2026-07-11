import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import 'create_order_api.dart';
import 'create_order_form_data.dart';
import 'create_order_models.dart';
import 'order_attachment_models.dart';

final createOrderApiProvider = Provider<CreateOrderApi>((ref) {
  return CreateOrderApi(ref.watch(dioProvider));
});

class CreateOrderRepository {
  CreateOrderRepository(this._api);

  final CreateOrderApi _api;

  Future<CreateOrderResult> createOrder(
    CreateOrderDraft draft, {
    List<SelectedOrderAttachment> attachments = const [],
  }) async {
    if (attachments.isEmpty) {
      final payload = buildCreateOrderPayload(draft);
      return _api.createOrder(payload);
    }

    final formData = await buildCreateOrderFormData(draft, attachments);
    return _api.createOrderWithFormData(formData);
  }
}

final createOrderRepositoryProvider = Provider<CreateOrderRepository>((ref) {
  return CreateOrderRepository(ref.watch(createOrderApiProvider));
});
