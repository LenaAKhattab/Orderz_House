import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/pool_order_models.dart';
import '../data/pool_orders_repository.dart';

final poolOrderDetailProvider =
    FutureProvider.autoDispose.family<PoolOrder, String>((ref, orderId) async {
  return ref.read(poolOrdersRepositoryProvider).fetchPoolOrderById(orderId);
});
