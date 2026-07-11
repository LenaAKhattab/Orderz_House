import 'package:dio/dio.dart';

import 'create_order_models.dart';

class CreateOrderApi {
  CreateOrderApi(this._dio);

  final Dio _dio;

  static const _multipartTimeout = Duration(seconds: 120);

  Future<CreateOrderResult> createOrder(Map<String, dynamic> payload) async {
    final response = await _dio.post<dynamic>('/client/orders', data: payload);
    return _parseResponse(response);
  }

  Future<CreateOrderResult> createOrderWithFormData(FormData formData) async {
    final response = await _dio.post<dynamic>(
      '/client/orders',
      data: formData,
      options: Options(
        contentType: 'multipart/form-data',
        sendTimeout: _multipartTimeout,
        receiveTimeout: _multipartTimeout,
      ),
    );
    return _parseResponse(response);
  }

  CreateOrderResult _parseResponse(Response<dynamic> response) {
    final body = response.data;
    if (body is Map<String, dynamic>) {
      return CreateOrderResult.fromResponse(body);
    }
    if (body is Map) {
      return CreateOrderResult.fromResponse(Map<String, dynamic>.from(body));
    }
    throw DioException(
      requestOptions: response.requestOptions,
      message: 'استجابة غير متوقعة من إنشاء الطلب.',
    );
  }
}
