/// Arabic copy for manuscript submit / revision (M6).
library;

import '../../../../core/i18n/i18n.dart';

String get manuscriptSubmitTitleAr => tr('تسليم المقال');
String get manuscriptRevisionTitleAr => tr('إرسال التعديل');
String get manuscriptContentLabelAr => tr('نص المقال');
String get manuscriptContentPlaceholderAr => tr('اكتب نص المقال هنا...');
String get manuscriptTitleLabelAr => tr('عنوان المقال النهائي');
String get manuscriptSubmitButtonAr => tr('إرسال المقال');
String get manuscriptRevisionButtonAr => tr('إرسال التعديل');
String get manuscriptSendingAr => tr('جارٍ الإرسال...');
String get manuscriptSuccessFirstAr => tr('تم إرسال المقال بنجاح، وسيتم مراجعته.');
String get manuscriptSuccessRevisionAr => tr('تم إرسال التعديل بنجاح، وسيتم مراجعته.');
String get manuscriptErrorFallbackAr => tr('تعذر إرسال المقال. حاول مرة أخرى.');
String get manuscriptEmptyValidationAr => tr('يرجى كتابة نص المقال قبل الإرسال.');
String get manuscriptTooShortValidationAr => tr('يجب ألا يقل نص المقال عن 50 حرفاً.');
String get manuscriptTitleRequiredAr => tr('يرجى إدخال عنوان المقال (3 أحرف على الأقل).');
String get manuscriptTermsRequiredAr => tr('يجب الموافقة على شروط ملكية ونشر المقال قبل التسليم.');
String get manuscriptTermsCopyAr => tr('أوافق على شروط ملكية ونشر هذا المقال، وأفهم أنه عند قبول المقال يمكن نشره باسمي على Bildazo وفق سياسة المنصة.');
String get manuscriptRevisionNotesLabelAr => tr('ملاحظات التعديل');
String get manuscriptStatusContextAr => tr('الحالة');
String get manuscriptActionSubmitAr => tr('تسليم المقال');
String get manuscriptActionReviseAr => tr('إرسال التعديل');

String get manuscriptForbiddenAr => tr('لا تملك صلاحية تنفيذ هذا الإجراء.');
String get manuscriptNotAllowedAr => tr('لا يمكنك تسليم هذا المقال حالياً.');
String get manuscriptAlreadySubmittedAr => tr('تم إرسال هذا المقال مسبقاً.');
String get manuscriptRevisionNotRequestedAr => tr('لا يوجد طلب تعديل على هذا المقال حالياً.');
String get manuscriptNetworkErrorAr => tr('تعذر الاتصال بالخادم. حاول مرة أخرى.');

/// Mirror backend ARTICLE_SUBMISSION_CONTENT_MIN_CHARS / TITLE_MIN.
const manuscriptContentMinChars = 50;
const manuscriptTitleMinChars = 3;
const manuscriptTitleMaxChars = 120;
const manuscriptContentMaxChars = 200000;
