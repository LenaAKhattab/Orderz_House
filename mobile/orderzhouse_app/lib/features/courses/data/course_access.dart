import 'package:dio/dio.dart';

/// Arabic lock copy — matches web `FREELANCER_COURSE_LOCKED_COPY_AR`.
const courseLockBadgeAr = 'يتطلب اشتراك';
const courseLockMessageAr = 'يجب الاشتراك بإحدى الخطط للوصول إلى هذه الدورة.';
const courseLockCtaAr = 'اشترك بإحدى الخطط';
const courseLockOpenPlansFailedAr = 'تعذر فتح صفحة الخطط.';

const courseSubscriptionRequiredCode = 'COURSE_SUBSCRIPTION_REQUIRED';

class CourseLockCopyAr {
  const CourseLockCopyAr({
    this.badge,
    this.message,
    this.cta,
  });

  final String? badge;
  final String? message;
  final String? cta;

  String get badgeOrDefault =>
      (badge != null && badge!.trim().isNotEmpty) ? badge!.trim() : courseLockBadgeAr;

  String get messageOrDefault =>
      (message != null && message!.trim().isNotEmpty) ? message!.trim() : courseLockMessageAr;

  String get ctaOrDefault =>
      (cta != null && cta!.trim().isNotEmpty) ? cta!.trim() : courseLockCtaAr;

  factory CourseLockCopyAr.fromJson(dynamic raw) {
    if (raw is! Map) return const CourseLockCopyAr();
    final map = Map<String, dynamic>.from(raw);
    String? pick(String key) {
      final v = map[key];
      if (v == null) return null;
      final s = '$v'.trim();
      return s.isEmpty ? null : s;
    }

    return CourseLockCopyAr(
      badge: pick('badge'),
      message: pick('message'),
      cta: pick('cta'),
    );
  }
}

String? extractCourseApiErrorCode(Object error) {
  if (error is! DioException) return null;
  final data = error.response?.data;
  if (data is! Map) return null;
  final code = data['code'] ?? data['publicCode'] ?? data['errorCode'];
  if (code == null) return null;
  final s = code.toString().trim();
  return s.isEmpty ? null : s;
}

/// Maps known course access codes to Arabic; otherwise null (caller uses generic helper).
String? mapCourseAccessErrorMessage(Object error) {
  final code = extractCourseApiErrorCode(error);
  if (code == courseSubscriptionRequiredCode) {
    return courseLockMessageAr;
  }
  if (code == 'COURSE_ACCESS_DENIED') {
    return 'لا يمكنك الوصول إلى هذه الدورة.';
  }
  return null;
}
