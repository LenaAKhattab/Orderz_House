import 'package:dio/dio.dart';

import 'client_delivery_review_models.dart';
import 'client_order_models.dart';

class ClientDeliveryReviewApi {
  ClientDeliveryReviewApi(this._dio);

  final Dio _dio;

  Future<ClientOrder> approveDelivery(String orderId) async {
    final response = await _dio.post<dynamic>('/client/orders/$orderId/delivery/approve');
    return _parseOrderResponse(response);
  }

  Future<ClientOrder> requestRevision(String orderId, RequestDeliveryRevisionPayload payload) async {
    final response = await _dio.post<dynamic>(
      '/client/orders/$orderId/delivery/revision',
      data: payload.toJson(),
    );
    return _parseOrderResponse(response);
  }

  ClientOrder _parseOrderResponse(Response<dynamic> response) {
    final body = response.data;
    if (body is Map<String, dynamic>) {
      return ClientOrder.fromResponse(body);
    }
    if (body is Map) {
      return ClientOrder.fromResponse(Map<String, dynamic>.from(body));
    }
    throw DioException(
      requestOptions: response.requestOptions,
      message: 'استجابة غير متوقعة من مراجعة التسليم.',
    );
  }
}
