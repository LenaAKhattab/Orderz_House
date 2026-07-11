import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import 'client_order_review_api.dart';
import 'client_order_review_models.dart';

final clientOrderReviewApiProvider = Provider<ClientOrderReviewApi>((ref) {
  return ClientOrderReviewApi(ref.watch(dioProvider));
});

class ClientOrderReviewRepository {
  ClientOrderReviewRepository(this._api);

  final ClientOrderReviewApi _api;

  Future<ClientOrderReviewStatus> fetchReviewStatus(String orderId) =>
      _api.fetchReviewStatus(orderId);

  Future<ClientFreelancerReview> submitReview(
    String orderId,
    SubmitClientOrderReviewPayload payload,
  ) =>
      _api.submitReview(orderId, payload);

  Future<ClientFreelancerReview> updateReview(
    String orderId,
    SubmitClientOrderReviewPayload payload,
  ) =>
      _api.updateReview(orderId, payload);
}

final clientOrderReviewRepositoryProvider = Provider<ClientOrderReviewRepository>((ref) {
  return ClientOrderReviewRepository(ref.watch(clientOrderReviewApiProvider));
});
