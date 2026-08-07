import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import 'freelancer_my_order_models.dart';
import 'freelancer_my_orders_api.dart';

final freelancerMyOrdersApiProvider = Provider<FreelancerMyOrdersApi>((ref) {
  return FreelancerMyOrdersApi(ref.watch(dioProvider));
});

class FreelancerMyOrdersRepository {
  FreelancerMyOrdersRepository(this._api);

  final FreelancerMyOrdersApi _api;

  Future<List<FreelancerMyOrder>> fetchMyOrders() => _api.fetchMyOrders();

  Future<FreelancerMyOrder> fetchMyOrderById(String id) => _api.fetchMyOrderById(id);
}

final freelancerMyOrdersRepositoryProvider = Provider<FreelancerMyOrdersRepository>((ref) {
  return FreelancerMyOrdersRepository(ref.watch(freelancerMyOrdersApiProvider));
});
