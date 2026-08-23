import 'package:dio/dio.dart';

import '../../../../core/errors/api_error_message.dart';
import 'my_articles_copy.dart';

String myArticlesErrorMessage(Object error) {
  if (error is DioException) {
    final status = error.response?.statusCode;
    if (status == 401) return myArticlesUnauthorizedAr;
    if (status == 403) return myArticlesForbiddenAr;
  }
  return apiErrorMessage(error, fallback: myArticlesLoadErrorAr);
}
