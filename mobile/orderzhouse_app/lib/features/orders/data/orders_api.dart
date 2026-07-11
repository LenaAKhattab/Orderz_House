import 'package:dio/dio.dart';

import 'pool_order_models.dart';

class OrdersApi {
  OrdersApi(this._dio);

  final Dio _dio;

  Future<PoolOrdersPage> fetchPoolOrders({int page = 1, int limit = 20}) async {
    final response = await _dio.get<dynamic>(
      '/orders/pool',
      queryParameters: {'page': page, 'limit': limit, 'sort': 'newest'},
    );
    final body = response.data;
    if (body is Map<String, dynamic>) {
      return PoolOrdersPage.fromResponse(body);
    }
    if (body is Map) {
      return PoolOrdersPage.fromResponse(Map<String, dynamic>.from(body));
    }
    throw DioException(
      requestOptions: response.requestOptions,
      message: 'استجابة غير متوقعة من سوق الطلبات.',
    );
  }

  Future<PoolOrder> fetchPoolOrderById(String id) async {
    final response = await _dio.get<dynamic>('/orders/pool/$id');
    final body = response.data;
    if (body is Map<String, dynamic>) {
      return PoolOrder.fromResponse(body);
    }
    if (body is Map) {
      return PoolOrder.fromResponse(Map<String, dynamic>.from(body));
    }
    throw DioException(
      requestOptions: response.requestOptions,
      message: 'استجابة غير متوقعة من تفاصيل الطلب.',
    );
  }
}
