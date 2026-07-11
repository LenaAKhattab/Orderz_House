import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import 'client_delivery_review_api.dart';
import 'client_delivery_review_models.dart';
import 'client_order_models.dart';

final clientDeliveryReviewApiProvider = Provider<ClientDeliveryReviewApi>((ref) {
  return ClientDeliveryReviewApi(ref.watch(dioProvider));
});

class ClientDeliveryReviewRepository {
  ClientDeliveryReviewRepository(this._api);

  final ClientDeliveryReviewApi _api;

  Future<ClientOrder> approveDelivery(String orderId) => _api.approveDelivery(orderId);

  Future<ClientOrder> requestRevision(String orderId, RequestDeliveryRevisionPayload payload) =>
      _api.requestRevision(orderId, payload);
}

final clientDeliveryReviewRepositoryProvider = Provider<ClientDeliveryReviewRepository>((ref) {
  return ClientDeliveryReviewRepository(ref.watch(clientDeliveryReviewApiProvider));
});
