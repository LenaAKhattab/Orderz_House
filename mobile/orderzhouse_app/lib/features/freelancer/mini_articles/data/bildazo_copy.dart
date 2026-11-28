/// Unified Bildazo Writer Experience Arabic copy (web ord20 / M7 parity).
library;

import '../../../../core/i18n/i18n.dart';

String get bildazoRequiredAr => tr('لتتمكن من تنفيذ المقالات ونشر أعمالك باسمك، فعّل ملف الكاتب الخاص بك على Bildazo.');
String get bildazoActivateCtaAr => tr('تفعيل حساب الكاتب على Bildazo');
String get bildazoLinkedStatusAr => tr('حساب Bildazo: مفعّل ✓');
String get bildazoPublishSuccessAr => tr('تم نشر مقالك بنجاح على Bildazo.');
String get bildazoViewArticleAr => tr('مشاهدة المقال');
String get bildazoViewWriterProfileAr => tr('مشاهدة ملفي ككاتب');
String get bildazoOpenHandoffFailedAr => tr('تعذر فتح صفحة تفعيل حساب الكاتب على Bildazo.');
String get bildazoGateOptionalAr => tr('تفعيل ملف الكاتب على Bildazo اختياري حالياً.');

/// API / apply error mapping (shorter than gate body copy).
String get bildazoNotLinkedErrorAr => tr('فعّل ملف الكاتب على Bildazo قبل المتابعة.');
String get bildazoIncompleteProfileErrorAr => tr('ملف الكاتب غير مكتمل حالياً.');
String get bildazoPermissionErrorAr => tr('لا تملك صلاحية تنفيذ هذا الإجراء.');
String get bildazoActionFallbackErrorAr => tr('تعذر تنفيذ الإجراء. حاول مرة أخرى.');

/// Legacy alias for older call sites.
final bildazoOpenWebCtaAr = bildazoActivateCtaAr;
