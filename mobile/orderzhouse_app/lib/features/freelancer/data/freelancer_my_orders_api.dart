import 'package:dio/dio.dart';

import 'freelancer_my_order_models.dart';

class FreelancerMyOrdersApi {
  FreelancerMyOrdersApi(this._dio);

  final Dio _dio;

  Future<List<FreelancerMyOrder>> fetchMyOrders() async {
    final response = await _dio.get<dynamic>('/freelancer/my-orders');
    final body = response.data;
    if (body is Map<String, dynamic>) {
      return FreelancerMyOrder.parseList(body);
    }
    if (body is Map) {
      return FreelancerMyOrder.parseList(Map<String, dynamic>.from(body));
    }
    throw DioException(
      requestOptions: response.requestOptions,
      message: 'استجابة غير متوقعة من طلبات المستقل.',
    );
  }

  Future<FreelancerMyOrder> fetchMyOrderById(String id) async {
    final response = await _dio.get<dynamic>('/freelancer/my-orders/$id');
    final body = response.data;
    if (body is Map<String, dynamic>) {
      return FreelancerMyOrder.fromResponse(body);
    }
    if (body is Map) {
      return FreelancerMyOrder.fromResponse(Map<String, dynamic>.from(body));
    }
    throw DioException(
      requestOptions: response.requestOptions,
      message: 'استجابة غير متوقعة من تفاصيل طلب المستقل.',
    );
  }
}
