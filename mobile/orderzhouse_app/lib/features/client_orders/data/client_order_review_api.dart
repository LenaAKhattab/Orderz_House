import 'package:dio/dio.dart';

import 'client_order_review_models.dart';

class ClientOrderReviewApi {
  ClientOrderReviewApi(this._dio);

  final Dio _dio;

  Future<ClientOrderReviewStatus> fetchReviewStatus(String orderId) async {
    final response = await _dio.get<dynamic>('/client/orders/$orderId/review');
    return _parseStatusResponse(response);
  }

  Future<ClientFreelancerReview> submitReview(
    String orderId,
    SubmitClientOrderReviewPayload payload,
  ) async {
    final response = await _dio.post<dynamic>(
      '/client/orders/$orderId/review',
      data: payload.toJson(),
    );
    return _parseReviewResponse(response);
  }

  Future<ClientFreelancerReview> updateReview(
    String orderId,
    SubmitClientOrderReviewPayload payload,
  ) async {
    final response = await _dio.patch<dynamic>(
      '/client/orders/$orderId/review',
      data: payload.toJson(),
    );
    return _parseReviewResponse(response);
  }

  ClientOrderReviewStatus _parseStatusResponse(Response<dynamic> response) {
    final body = response.data;
    if (body is Map<String, dynamic>) {
      return ClientOrderReviewStatus.fromResponse(body);
    }
    if (body is Map) {
      return ClientOrderReviewStatus.fromResponse(Map<String, dynamic>.from(body));
    }
    throw DioException(
      requestOptions: response.requestOptions,
      message: 'استجابة غير متوقعة من حالة التقييم.',
    );
  }

  ClientFreelancerReview _parseReviewResponse(Response<dynamic> response) {
    final body = response.data;
    Map<String, dynamic>? map;
    if (body is Map<String, dynamic>) {
      map = body;
    } else if (body is Map) {
      map = Map<String, dynamic>.from(body);
    }
    if (map != null) {
      final data = map['data'];
      if (data is Map) {
        final review = Map<String, dynamic>.from(data)['review'];
        if (review is Map) {
          return ClientFreelancerReview.fromJson(Map<String, dynamic>.from(review));
        }
      }
    }
    throw DioException(
      requestOptions: response.requestOptions,
      message: 'استجابة غير متوقعة من التقييم.',
    );
  }
}
