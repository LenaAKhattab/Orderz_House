import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import 'orders_api.dart';
import 'pool_order_models.dart';

final ordersApiProvider = Provider<OrdersApi>((ref) {
  return OrdersApi(ref.watch(dioProvider));
});

class PoolOrdersRepository {
  PoolOrdersRepository(this._api);

  final OrdersApi _api;

  Future<PoolOrdersPage> fetchPoolOrders({int page = 1, int limit = 20}) {
    return _api.fetchPoolOrders(page: page, limit: limit);
  }

  Future<PoolOrder> fetchPoolOrderById(String id) {
    return _api.fetchPoolOrderById(id);
  }
}

final poolOrdersRepositoryProvider = Provider<PoolOrdersRepository>((ref) {
  return PoolOrdersRepository(ref.watch(ordersApiProvider));
});
