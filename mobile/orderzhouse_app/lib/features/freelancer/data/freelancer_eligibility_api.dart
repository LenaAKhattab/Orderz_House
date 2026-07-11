import 'package:dio/dio.dart';

import 'freelancer_eligibility_models.dart';

class FreelancerEligibilityApi {
  FreelancerEligibilityApi(this._dio);

  final Dio _dio;

  Future<FreelancerEligibility> fetchEligibility() async {
    final response = await _dio.get<dynamic>('/freelancer/eligibility');
    final body = response.data;
    if (body is Map<String, dynamic>) {
      return FreelancerEligibility.fromResponse(body);
    }
    if (body is Map) {
      return FreelancerEligibility.fromResponse(Map<String, dynamic>.from(body));
    }
    throw DioException(
      requestOptions: response.requestOptions,
      message: 'استجابة غير متوقعة من أهلية المستقل.',
    );
  }
}
