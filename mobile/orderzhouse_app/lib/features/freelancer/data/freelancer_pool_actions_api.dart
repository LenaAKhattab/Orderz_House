import 'package:dio/dio.dart';

import '../../orders/data/pool_order_models.dart';
import 'freelancer_pool_actions_models.dart';

class FreelancerPoolActionsApi {
  FreelancerPoolActionsApi(this._dio);

  final Dio _dio;

  Future<PoolOrder> takePoolOrder(String orderId) async {
    final response = await _dio.post<dynamic>('/orders/pool/$orderId/take');
    return _parseOrderResponse(response);
  }

  Future<PoolOrder> submitPoolBid(String orderId, SubmitPoolBidPayload payload) async {
    final response = await _dio.post<dynamic>(
      '/orders/pool/$orderId/bids',
      data: payload.toJson(),
    );
    return _parseOrderResponse(response);
  }

  PoolOrder _parseOrderResponse(Response<dynamic> response) {
    final body = response.data;
    if (body is Map<String, dynamic>) {
      return PoolOrder.fromResponse(body);
    }
    if (body is Map) {
      return PoolOrder.fromResponse(Map<String, dynamic>.from(body));
    }
    throw DioException(
      requestOptions: response.requestOptions,
      message: 'استجابة غير متوقعة من السوق.',
    );
  }
}
