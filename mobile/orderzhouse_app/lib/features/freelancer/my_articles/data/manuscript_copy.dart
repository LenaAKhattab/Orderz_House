/// Arabic copy for manuscript submit / revision (M6).
library;

const manuscriptSubmitTitleAr = 'تسليم المقال';
const manuscriptRevisionTitleAr = 'إرسال التعديل';
const manuscriptContentLabelAr = 'نص المقال';
const manuscriptContentPlaceholderAr = 'اكتب نص المقال هنا...';
const manuscriptTitleLabelAr = 'عنوان المقال النهائي';
const manuscriptSubmitButtonAr = 'إرسال المقال';
const manuscriptRevisionButtonAr = 'إرسال التعديل';
const manuscriptSendingAr = 'جارٍ الإرسال...';
const manuscriptSuccessFirstAr = 'تم إرسال المقال بنجاح، وسيتم مراجعته.';
const manuscriptSuccessRevisionAr = 'تم إرسال التعديل بنجاح، وسيتم مراجعته.';
const manuscriptErrorFallbackAr = 'تعذر إرسال المقال. حاول مرة أخرى.';
const manuscriptEmptyValidationAr = 'يرجى كتابة نص المقال قبل الإرسال.';
const manuscriptTooShortValidationAr = 'يجب ألا يقل نص المقال عن 50 حرفاً.';
const manuscriptTitleRequiredAr = 'يرجى إدخال عنوان المقال (3 أحرف على الأقل).';
const manuscriptTermsRequiredAr = 'يجب الموافقة على شروط ملكية ونشر المقال قبل التسليم.';
const manuscriptTermsCopyAr =
    'أوافق على شروط ملكية ونشر هذا المقال، وأفهم أنه عند قبول المقال يمكن نشره باسمي على Bildazo وفق سياسة المنصة.';
const manuscriptRevisionNotesLabelAr = 'ملاحظات التعديل';
const manuscriptStatusContextAr = 'الحالة';
const manuscriptActionSubmitAr = 'تسليم المقال';
const manuscriptActionReviseAr = 'إرسال التعديل';

const manuscriptForbiddenAr = 'لا تملك صلاحية تنفيذ هذا الإجراء.';
const manuscriptNotAllowedAr = 'لا يمكنك تسليم هذا المقال حالياً.';
const manuscriptAlreadySubmittedAr = 'تم إرسال هذا المقال مسبقاً.';
const manuscriptRevisionNotRequestedAr = 'لا يوجد طلب تعديل على هذا المقال حالياً.';
const manuscriptNetworkErrorAr = 'تعذر الاتصال بالخادم. حاول مرة أخرى.';

/// Mirror backend ARTICLE_SUBMISSION_CONTENT_MIN_CHARS / TITLE_MIN.
const manuscriptContentMinChars = 50;
const manuscriptTitleMinChars = 3;
const manuscriptTitleMaxChars = 120;
const manuscriptContentMaxChars = 200000;
