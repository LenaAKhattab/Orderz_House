import 'package:dio/dio.dart';
import '../i18n/i18n.dart';
import '../i18n/server_text.dart';

String apiErrorMessage(Object error, {String? fallback}) {
  final fb = fallback ?? tr('حدث خطأ غير متوقع، حاول لاحقاً.');
  if (error is DioException) {
    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.receiveTimeout ||
        error.type == DioExceptionType.sendTimeout) {
      return tr('استغرق الطلب وقتاً طويلاً. تحقق من الاتصال وحاول مجدداً.');
    }
    if (error.type == DioExceptionType.connectionError) {
      return tr('تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مجدداً.');
    }
    final data = error.response?.data;
    if (data is Map) {
      final code = data['code'] ?? data['publicCode'] ?? data['errorCode'];
      final codeStr = code == null ? '' : code.toString().trim();
      if (codeStr == 'COURSE_SUBSCRIPTION_REQUIRED') {
        return tr('يجب الاشتراك بإحدى الخطط للوصول إلى هذه الدورة.');
      }
      if (codeStr == 'COURSE_PLAN_UPGRADE_REQUIRED') {
        return tr('هذه الدورة متاحة لباقات أعلى');
      }
      if (codeStr == 'COURSE_ACCESS_DENIED') {
        return tr('لا يمكنك الوصول إلى هذه الدورة.');
      }
      final message = data['message'];
      if (message is String && message.trim().isNotEmpty) {
        return localizeServerText(message.trim(), fallback: fb);
      }
      // Some non-Orderz / legacy APIs use `error` instead of `message`.
      final alt = data['error'];
      if (alt is String && alt.trim().isNotEmpty) {
        return localizeServerText(alt.trim(), fallback: fb);
      }
    }
    final status = error.response?.statusCode;
    if (status == 401) {
      return tr('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
    }
    if (status == 429) {
      return tr('تم تجاوز عدد المحاولات. انتظر قليلًا ثم حاول مرة أخرى.');
    }
  }
  return fb;
}
