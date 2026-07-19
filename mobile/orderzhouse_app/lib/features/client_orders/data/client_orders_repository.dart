import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import 'client_order_bid_models.dart';
import 'client_order_models.dart';
import 'order_payment_models.dart';
import 'client_orders_api.dart';

final clientOrdersApiProvider = Provider<ClientOrdersApi>((ref) {
  return ClientOrdersApi(ref.watch(dioProvider));
});

class ClientOrdersRepository {
  ClientOrdersRepository(this._api);

  final ClientOrdersApi _api;

  Future<List<ClientOrder>> fetchMyOrders() => _api.fetchMyOrders();

  Future<ClientOrder> fetchMyOrderById(String id) => _api.fetchMyOrderById(id);

  Future<ClientOrderBidsResult> listOrderBids(String orderId) =>
      _api.listOrderBids(orderId);

  Future<AcceptBidResult> acceptOrderBid({
    required String orderId,
    required String bidId,
  }) =>
      _api.acceptOrderBid(orderId: orderId, bidId: bidId);

  Future<void> rejectOrderBid({
    required String orderId,
    required String bidId,
  }) =>
      _api.rejectOrderBid(orderId: orderId, bidId: bidId);

  Future<OrderCheckoutSession> requestFixedOrderPayCheckout(String orderId) =>
      _api.requestFixedOrderPayCheckout(orderId);

  Future<void> confirmFixedOrderPayment(String orderId, {String? sessionId}) =>
      _api.confirmFixedOrderPayment(orderId, sessionId: sessionId);
}

final clientOrdersRepositoryProvider = Provider<ClientOrdersRepository>((ref) {
  return ClientOrdersRepository(ref.watch(clientOrdersApiProvider));
});
