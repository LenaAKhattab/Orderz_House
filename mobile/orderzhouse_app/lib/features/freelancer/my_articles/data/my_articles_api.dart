import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/dio_provider.dart';
import 'manuscript_models.dart';
import 'my_articles_models.dart';

final myArticlesApiProvider = Provider<MyArticlesApi>((ref) {
  return MyArticlesApi(ref.watch(dioProvider));
});

class MyArticlesApi {
  MyArticlesApi(this._dio);

  final Dio _dio;

  /// GET /freelancer/article-applications — authenticated freelancer portfolio.
  Future<MyArticlesSnapshot> listMyArticles({
    String? status,
    int limit = 50,
    int offset = 0,
  }) async {
    final query = <String, dynamic>{
      'limit': limit,
      'offset': offset,
    };
    final filter = status?.trim();
    if (filter != null && filter.isNotEmpty && filter != 'all') {
      query['status'] = filter;
    }

    final response = await _dio.get<dynamic>(
      '/freelancer/article-applications',
      queryParameters: query,
    );
    return MyArticlesSnapshot.fromResponse(response.data);
  }

  /// POST /freelancer/article-applications/:id/final-manuscript
  /// Same endpoint for first submit and revision resubmit (web parity).
  Future<ManuscriptSubmitResult> submitFinalManuscript({
    required String applicationId,
    required String title,
    required String content,
    bool termsAccepted = true,
  }) async {
    final id = applicationId.trim();
    final response = await _dio.post<dynamic>(
      '/freelancer/article-applications/$id/final-manuscript',
      data: {
        'title': title.trim(),
        'content': content.trim(),
        'termsAccepted': termsAccepted,
      },
    );
    return ManuscriptSubmitResult.fromResponse(response.data);
  }
}
