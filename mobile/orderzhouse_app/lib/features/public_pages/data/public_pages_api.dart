import 'package:dio/dio.dart';

import 'public_page_models.dart';

class PublicPagesApi {
  PublicPagesApi(this._dio);

  final Dio _dio;

  Future<PublicSitePage> fetchBySlug(String slug) async {
    final response = await _dio.get<dynamic>(
      '/public/site-pages/${Uri.encodeComponent(slug)}',
    );
    final body = response.data;
    if (body is Map<String, dynamic>) {
      return PublicSitePage.fromResponse(body);
    }
    if (body is Map) {
      return PublicSitePage.fromResponse(Map<String, dynamic>.from(body));
    }
    throw DioException(
      requestOptions: response.requestOptions,
      message: 'استجابة غير متوقعة.',
    );
  }
}
