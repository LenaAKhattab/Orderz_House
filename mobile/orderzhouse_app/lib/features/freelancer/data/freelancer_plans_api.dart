import 'package:dio/dio.dart';

import 'freelancer_plans_models.dart';

class FreelancerPlansApi {
  FreelancerPlansApi(this._dio);

  final Dio _dio;

  Future<List<PublicPlan>> fetchPlans() async {
    final response = await _dio.get<dynamic>('/plans');
    return PublicPlan.parseListResponse(response.data);
  }

  Future<FreelancerSubscriptionBundle> fetchSubscription() async {
    final response = await _dio.get<dynamic>('/freelancer/subscription');
    final body = response.data;
    if (body is Map<String, dynamic>) {
      return FreelancerSubscriptionBundle.fromResponse(body);
    }
    if (body is Map) {
      return FreelancerSubscriptionBundle.fromResponse(Map<String, dynamic>.from(body));
    }
    throw DioException(
      requestOptions: response.requestOptions,
      message: 'استجابة غير متوقعة من اشتراك المستقل.',
    );
  }
}
