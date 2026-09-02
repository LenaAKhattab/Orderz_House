import 'package:dio/dio.dart';

/// Course plan-lock copy — aligned with web freelancer dashboard.
const coursePlanLockBadgeAr = 'مقفلة';
const coursePlanLockMessageAr = 'هذه الدورة متاحة لباقات أعلى';
const coursePlanLockCtaAr = 'ترقية الباقة';

/// Legacy paid-membership gate (backward compatible).
const courseLockBadgeAr = 'يتطلب اشتراك';
const courseLockMessageAr = 'يجب الاشتراك بإحدى الخطط للوصول إلى هذه الدورة.';
const courseLockCtaAr = 'اشترك بإحدى الخطط';
const courseLockOpenPlansFailedAr = 'تعذر فتح صفحة الخطط.';

const courseSubscriptionRequiredCode = 'COURSE_SUBSCRIPTION_REQUIRED';
const coursePlanUpgradeRequiredCode = 'COURSE_PLAN_UPGRADE_REQUIRED';

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
      (badge != null && badge!.trim().isNotEmpty) ? badge!.trim() : coursePlanLockBadgeAr;

  String get messageOrDefault =>
      (message != null && message!.trim().isNotEmpty) ? message!.trim() : coursePlanLockMessageAr;

  String get ctaOrDefault =>
      (cta != null && cta!.trim().isNotEmpty) ? cta!.trim() : coursePlanLockCtaAr;

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

bool isCoursePlanUpgradeError(Object error) {
  final code = extractCourseApiErrorCode(error);
  return code == coursePlanUpgradeRequiredCode || code == courseSubscriptionRequiredCode;
}

/// Maps known course access codes to Arabic; otherwise null (caller uses generic helper).
String? mapCourseAccessErrorMessage(Object error) {
  final code = extractCourseApiErrorCode(error);
  if (code == coursePlanUpgradeRequiredCode) {
    return coursePlanLockMessageAr;
  }
  if (code == courseSubscriptionRequiredCode) {
    return courseLockMessageAr;
  }
  if (code == 'COURSE_ACCESS_DENIED') {
    return 'لا يمكنك الوصول إلى هذه الدورة.';
  }
  return null;
}

String courseLockCtaForError(Object error) {
  final code = extractCourseApiErrorCode(error);
  if (code == coursePlanUpgradeRequiredCode) {
    return coursePlanLockCtaAr;
  }
  return courseLockCtaAr;
}
