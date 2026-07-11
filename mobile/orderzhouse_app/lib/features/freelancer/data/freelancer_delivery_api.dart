import 'package:dio/dio.dart';

import 'freelancer_my_order_models.dart';

class FreelancerDeliveryApi {
  FreelancerDeliveryApi(this._dio);

  final Dio _dio;

  static const _multipartTimeout = Duration(seconds: 120);

  Future<FreelancerMyOrder> submitDelivery(String orderId, FormData formData) async {
    final response = await _dio.post<dynamic>(
      '/freelancer/my-orders/$orderId/delivery',
      data: formData,
      options: Options(
        contentType: 'multipart/form-data',
        sendTimeout: _multipartTimeout,
        receiveTimeout: _multipartTimeout,
      ),
    );
    return _parseOrderResponse(response);
  }

  FreelancerMyOrder _parseOrderResponse(Response<dynamic> response) {
    final body = response.data;
    if (body is Map<String, dynamic>) {
      return FreelancerMyOrder.fromResponse(body);
    }
    if (body is Map) {
      return FreelancerMyOrder.fromResponse(Map<String, dynamic>.from(body));
    }
    throw DioException(
      requestOptions: response.requestOptions,
      message: 'استجابة غير متوقعة من تسليم الطلب.',
    );
  }
}
