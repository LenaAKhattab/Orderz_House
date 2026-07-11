import 'package:dio/dio.dart';

String apiErrorMessage(Object error, {String fallback = 'حدث خطأ غير متوقع، حاول لاحقاً.'}) {
  if (error is DioException) {
    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.receiveTimeout ||
        error.type == DioExceptionType.sendTimeout) {
      return 'استغرق الطلب وقتاً طويلاً. تحقق من الاتصال وحاول مجدداً.';
    }
    if (error.type == DioExceptionType.connectionError) {
      return 'تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مجدداً.';
    }
    final data = error.response?.data;
    if (data is Map) {
      final message = data['message'];
      if (message is String && message.trim().isNotEmpty) {
        return message.trim();
      }
    }
  }
  return fallback;
}
