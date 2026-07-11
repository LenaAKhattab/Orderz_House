import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import '../../orders/data/pool_order_models.dart';
import 'freelancer_pool_actions_api.dart';
import 'freelancer_pool_actions_models.dart';

final freelancerPoolActionsApiProvider = Provider<FreelancerPoolActionsApi>((ref) {
  return FreelancerPoolActionsApi(ref.watch(dioProvider));
});

class FreelancerPoolActionsRepository {
  FreelancerPoolActionsRepository(this._api);

  final FreelancerPoolActionsApi _api;

  Future<PoolOrder> takePoolOrder(String orderId) => _api.takePoolOrder(orderId);

  Future<PoolOrder> submitPoolBid(String orderId, SubmitPoolBidPayload payload) {
    return _api.submitPoolBid(orderId, payload);
  }
}

final freelancerPoolActionsRepositoryProvider = Provider<FreelancerPoolActionsRepository>((ref) {
  return FreelancerPoolActionsRepository(ref.watch(freelancerPoolActionsApiProvider));
});
