import 'package:dio/dio.dart';

import 'client_order_bid_models.dart';
import 'client_order_models.dart';
import 'order_payment_models.dart';

class ClientOrdersApi {
  ClientOrdersApi(this._dio);

  final Dio _dio;

  Future<List<ClientOrder>> fetchMyOrders() async {
    final response = await _dio.get<dynamic>('/client/orders');
    final body = response.data;
    if (body is Map<String, dynamic>) {
      return ClientOrder.parseList(body);
    }
    if (body is Map) {
      return ClientOrder.parseList(Map<String, dynamic>.from(body));
    }
    throw DioException(
      requestOptions: response.requestOptions,
      message: 'استجابة غير متوقعة من طلبات العميل.',
    );
  }

  Future<ClientOrder> fetchMyOrderById(String id) async {
    final response = await _dio.get<dynamic>('/client/orders/$id');
    final body = response.data;
    if (body is Map<String, dynamic>) {
      return ClientOrder.fromResponse(body);
    }
    if (body is Map) {
      return ClientOrder.fromResponse(Map<String, dynamic>.from(body));
    }
    throw DioException(
      requestOptions: response.requestOptions,
      message: 'استجابة غير متوقعة من تفاصيل طلب العميل.',
    );
  }

  Future<ClientOrderBidsResult> listOrderBids(String orderId) async {
    final response = await _dio.get<dynamic>('/client/orders/$orderId/bids');
    final body = response.data;
    if (body is Map<String, dynamic>) {
      return ClientOrderBidsResult.fromResponse(body);
    }
    if (body is Map) {
      return ClientOrderBidsResult.fromResponse(Map<String, dynamic>.from(body));
    }
    throw DioException(
      requestOptions: response.requestOptions,
      message: 'استجابة غير متوقعة من عروض الطلب.',
    );
  }

  /// Body is `{ bidId }` only — identity comes from Bearer token.
  Future<AcceptBidResult> acceptOrderBid({
    required String orderId,
    required String bidId,
  }) async {
    final response = await _dio.post<dynamic>(
      '/client/orders/$orderId/bids/accept',
      data: <String, dynamic>{'bidId': bidId},
    );
    final body = response.data;
    if (body is Map<String, dynamic>) {
      return AcceptBidResult.fromResponse(body);
    }
    if (body is Map) {
      return AcceptBidResult.fromResponse(Map<String, dynamic>.from(body));
    }
    throw DioException(
      requestOptions: response.requestOptions,
      message: 'استجابة غير متوقعة من قبول العرض.',
    );
  }

  /// Body is `{ bidId }` only — identity comes from Bearer token.
  Future<void> rejectOrderBid({
    required String orderId,
    required String bidId,
  }) async {
    await _dio.post<dynamic>(
      '/client/orders/$orderId/bids/reject',
      data: <String, dynamic>{'bidId': bidId},
    );
  }

  Future<OrderCheckoutSession> requestFixedOrderPayCheckout(String orderId) async {
    final response = await _dio.post<dynamic>('/client/orders/$orderId/pay-checkout');
    final body = response.data;
    if (body is Map<String, dynamic>) {
      return OrderCheckoutSession.fromResponse(body);
    }
    if (body is Map) {
      return OrderCheckoutSession.fromResponse(Map<String, dynamic>.from(body));
    }
    throw DioException(
      requestOptions: response.requestOptions,
      message: 'استجابة غير متوقعة من رابط الدفع.',
    );
  }

  Future<void> confirmFixedOrderPayment(String orderId) async {
    await _dio.post<dynamic>('/client/orders/$orderId/pay-confirm');
  }
}
